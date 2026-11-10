import { createDatabase } from "./database.js";

const connectionString = process.env.MYSQL_URL;
if (!connectionString) {
  console.error("MYSQL_URL es obligatoria para ejecutar las migraciones.");
  process.exit(1);
}

let database;
try {
  database = createDatabase(connectionString, {
    production: process.env.NODE_ENV === "production",
    sslCa: String(process.env.MYSQL_SSL_CA || "").replace(/\\n/g, "\n"),
  });
  const result = await database.migrate();
  console.log(`Migraciones MySQL aplicadas: ${result.applied}. Versión actual: ${result.current}.`);
} catch (error) {
  console.error(`No se pudieron aplicar las migraciones MySQL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await database?.close();
}
