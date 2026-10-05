import { loadConfig } from "./config.js";
import { createMailer } from "./mailer.js";
import { createApp } from "./app.js";

const log = {
  info: (message) => console.log(`${new Date().toISOString()} INFO  ${message}`),
  warn: (message) => console.warn(`${new Date().toISOString()} WARN  ${message}`),
  error: (message) => console.error(`${new Date().toISOString()} ERROR ${message}`),
};

let config;
try {
  config = loadConfig();
} catch (error) {
  log.error(error.message);
  process.exit(1);
}

const mailer = await createMailer(config, log);
const server = createApp({ config, mailer, log });
server.on("error", (error) => {
  log.error(`No se pudo iniciar el servidor: ${error.message}`);
  mailer.close();
  process.exit(1);
});
server.listen(config.port, config.host, async () => {
  log.info(`Servicio de notificaciones escuchando en ${config.host}:${config.port}`);
  if (!config.apiKey) log.warn("NOTIFY_API_KEY está vacía: cualquiera que llegue al servicio puede enviar correos.");
  try {
    await mailer.verify();
    log.info("Conexión SMTP verificada.");
  } catch (error) {
    // No se detiene: el SMTP puede recuperarse; cada envío reintenta por su cuenta.
    log.warn(`No se pudo verificar el SMTP al arrancar: ${error?.message || error}`);
  }
});

function shutdown(signal) {
  log.info(`${signal} recibido, cerrando...`);
  server.close(() => {
    mailer.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => log.error(`Promesa sin manejar: ${reason?.stack || reason}`));
