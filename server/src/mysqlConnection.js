import { createHash } from "node:crypto";

export function createMySqlConnectionOptions(connectionString, { production, ca } = {}) {
  const url = new URL(connectionString);
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL debe usar el formato mysql://usuario:contraseña@host:puerto/base.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!url.hostname || !database) {
    throw new Error("DATABASE_URL debe incluir el servidor y el nombre de la base de datos MySQL.");
  }

  const port = Number(url.port || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("El puerto de DATABASE_URL debe estar entre 1 y 65535.");
  }

  return {
    host: url.hostname,
    port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ...(production
      ? { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } }
      : {}),
  };
}

export function createPhoneLockName(phone) {
  return createHash("sha256").update(phone).digest("hex");
}
