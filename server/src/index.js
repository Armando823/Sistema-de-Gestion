import { loadConfig } from "./config.js";
import { createMailer } from "./mailer.js";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";
import { hashPassword, normalizeEmail, validateCredentials } from "./auth.js";

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
let database;
if (config.production && !config.databaseUrl) {
  log.error("DATABASE_URL es obligatoria para el servicio web en producción.");
  process.exit(1);
}
if (config.databaseUrl) {
  if (config.sessionSecret.length < 32) {
    log.error("SESSION_SECRET debe tener al menos 32 caracteres.");
    process.exit(1);
  }
  if (config.adminPassword && config.adminPassword.length < 12) {
    log.error("ADMIN_PASSWORD debe tener al menos 12 caracteres.");
    process.exit(1);
  }
  if (Boolean(config.adminEmail) !== Boolean(config.adminPassword)) {
    log.error("ADMIN_EMAIL y ADMIN_PASSWORD deben configurarse juntos.");
    process.exit(1);
  }
  if (config.adminEmail && validateCredentials(normalizeEmail(config.adminEmail), config.adminPassword)) {
    log.error("ADMIN_EMAIL o ADMIN_PASSWORD no cumplen el formato requerido.");
    process.exit(1);
  }
  try {
    database = createDatabase(config.databaseUrl);
    await database.initialize({
      adminEmail: config.adminEmail,
      adminPassword: config.adminPassword,
      hashPassword,
    });
    log.info("Base de datos PostgreSQL lista.");
  } catch (error) {
    log.error(`No se pudo preparar PostgreSQL: ${error.message}`);
    await database?.close();
    process.exit(1);
  }
}
const server = createApp({ config, mailer, database, log });
server.on("error", (error) => {
  log.error(`No se pudo iniciar el servidor: ${error.message}`);
  mailer.close();
  database?.close();
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
    Promise.resolve(database?.close()).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => log.error(`Promesa sin manejar: ${reason?.stack || reason}`));
