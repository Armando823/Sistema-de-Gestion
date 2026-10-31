// MySQL dump. La carpeta de salida debe ser un volumen persistente o sincronizarse
// a almacenamiento externo; el disco efímero de Render no es un destino de respaldo.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

export function parseMysqlUrl(value) {
  if (!value) throw new Error("MYSQL_URL es obligatoria para ejecutar el respaldo.");
  const url = new URL(value);
  if (url.protocol !== "mysql:" || !url.hostname || !url.username || !url.pathname.slice(1)) {
    throw new Error("MYSQL_URL debe incluir host, usuario y nombre de base de datos.");
  }
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

export function buildDumpArgs(connection, caPath) {
  const args = [
    "--protocol=TCP",
    `--host=${connection.host}`,
    `--port=${connection.port}`,
    `--user=${connection.user}`,
    "--single-transaction",
    "--quick",
    "--routines",
    "--triggers",
    "--hex-blob",
  ];
  if (caPath) args.push("--ssl-mode=VERIFY_IDENTITY", `--ssl-ca=${caPath}`);
  else args.push("--ssl-mode=VERIFY_IDENTITY");
  args.push(connection.database);
  return args;
}

async function main() {
  const connection = parseMysqlUrl(process.env.MYSQL_URL);
  const backupDir = resolve(process.env.BACKUP_DIR || join(process.cwd(), "backups"));
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = join(backupDir, `backup-${stamp}.sql`);
  const partial = `${destination}.partial`;
  let tempDir;
  try {
    let caPath;
    const ca = String(process.env.MYSQL_SSL_CA || "").replace(/\\n/g, "\n");
    if (ca) {
      tempDir = await mkdtemp(join(tmpdir(), "taller-backup-"));
      caPath = join(tempDir, "mysql-ca.pem");
      await writeFile(caPath, ca, { mode: 0o600 });
      await chmod(caPath, 0o600);
    }
    const child = spawn("mysqldump", buildDumpArgs(connection, caPath), {
      stdio: ["ignore", "pipe", "inherit"],
      env: { ...process.env, MYSQL_PWD: connection.password },
    });
    const exit = new Promise((resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("close", (code) => code === 0
        ? resolveExit()
        : rejectExit(new Error(`mysqldump terminó con código ${code}`)));
    });
    await Promise.all([
      pipeline(child.stdout, createWriteStream(partial, { mode: 0o600 })),
      exit,
    ]);
    await rename(partial, destination);
    console.log(`Respaldo creado: ${destination}`);
    console.warn("Comprueba que BACKUP_DIR sea almacenamiento persistente y que el respaldo se copie fuera del servidor.");
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`No se pudo completar el respaldo: ${error.message}`);
    process.exitCode = 1;
  });
}
