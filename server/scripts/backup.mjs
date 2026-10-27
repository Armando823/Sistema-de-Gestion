// Respaldo de la base de datos MySQL usando mysqldump.
// Requiere la variable de entorno MYSQL_URL y el binario mysqldump en PATH.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const mysqlUrl = process.env.MYSQL_URL;
if (!mysqlUrl) {
  console.error("MYSQL_URL es obligatoria para ejecutar el respaldo.");
  process.exit(1);
}

const url = new URL(mysqlUrl);
const database = url.pathname.replace(/^\//, "");
const outFile = resolve(process.cwd(), "backups", `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
mkdirSync(resolve(process.cwd(), "backups"), { recursive: true });

const args = [
  `-h${url.hostname}`,
  `-P${url.port || 3306}`,
  `-u${decodeURIComponent(url.username)}`,
  process.env.MYSQL_PASSWORD ? `-p${process.env.MYSQL_PASSWORD}` : "",
  "--single-transaction",
  "--routines",
  "--triggers",
  database,
].filter(Boolean);

const output = createWriteStream(outFile);
const child = spawn("mysqldump", args, { stdio: ["ignore", "pipe", "inherit"] });
child.stdout.pipe(output);
child.on("error", (error) => {
  console.error(`No se pudo ejecutar mysqldump: ${error.message}`);
  process.exit(1);
});
child.on("close", (code) => {
  if (code === 0) console.log(`Respaldo creado en ${outFile}`);
  else {
    console.error(`mysqldump terminó con código ${code}`);
    process.exit(code || 1);
  }
});