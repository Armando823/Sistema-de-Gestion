// Envío de correo. nodemailer se carga solo cuando hace falta, así el resto del
// servicio (y sus pruebas) no depende de él.

export async function createMailer(config, log = console) {
  if (config.mail.dryRun) {
    return {
      async send(message) {
        log.info(`[MAIL_DRY_RUN] Correo NO enviado. Asunto: ${message.subject}`);
        return { dryRun: true };
      },
      async verify() {},
      close() {},
    };
  }

  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    pool: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    send: (message) => transport.sendMail({ from: config.mail.from, ...message }),
    verify: () => transport.verify(),
    close: () => transport.close(),
  };
}

// Un error 5xx del servidor de correo (buzón inexistente, rechazo por política)
// es permanente: reintentar no sirve. Los fallos de red o 4xx sí se reintentan.
export function isTransient(error) {
  const code = Number(error?.responseCode);
  if (Number.isFinite(code) && code >= 500) return false;
  return true;
}

export async function sendWithRetry(
  mailer,
  message,
  { attempts = 3, delayMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await mailer.send(message);
    } catch (error) {
      lastError = error;
      log.warn(`Fallo al enviar correo (intento ${attempt}/${attempts}): ${error?.message || error}`);
      if (!isTransient(error) || attempt === attempts) break;
      await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}
