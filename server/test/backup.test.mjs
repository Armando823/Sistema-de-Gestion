import test from "node:test";
import assert from "node:assert/strict";
import { parseMysqlUrl, buildDumpArgs } from "../scripts/backup.mjs";

test("backup parses credentials from MYSQL_URL including URL-encoded characters", () => {
  assert.deepEqual(parseMysqlUrl("mysql://backup:p%40ss%3Aword@db.example:4000/taller"), {
    host: "db.example",
    port: 4000,
    user: "backup",
    password: "p@ss:word",
    database: "taller",
  });
});

test("backup rejects missing or malformed connection URLs", () => {
  assert.throws(() => parseMysqlUrl(""), /MYSQL_URL/);
  assert.throws(() => parseMysqlUrl("https://db.example/taller"), /MYSQL_URL/);
});

test("mysqldump uses TLS hostname verification and never receives the password as an argument", () => {
  const connection = parseMysqlUrl("mysql://backup:secret@db.example:4000/taller");
  const args = buildDumpArgs(connection, "/tmp/mysql-ca.pem");
  assert.ok(args.includes("--ssl-mode=VERIFY_IDENTITY"));
  assert.ok(args.includes("--ssl-ca=/tmp/mysql-ca.pem"));
  assert.ok(!args.some((arg) => arg.includes("secret")));
  assert.equal(args.at(-1), "taller");
});
