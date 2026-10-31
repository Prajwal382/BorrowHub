// NFR-07: replaces the dev database contents with a dump made by db-backup.mjs.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";

const inputPath = process.argv[2];

if (!inputPath || !existsSync(inputPath)) {
  console.error("Usage: npm run db:restore -- backups/<file>.dump");
  process.exit(1);
}

const input = openSync(inputPath, "r");

const result = spawnSync(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "postgres",
    "pg_restore",
    "-U",
    "borrowhub",
    "-d",
    "borrowhub",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--single-transaction",
  ],
  { stdio: [input, "inherit", "inherit"] },
);
closeSync(input);

if (result.status !== 0) {
  console.error("Restore failed. The database was left unchanged.");
  process.exit(1);
}

console.log(`Restored database from ${inputPath}.`);
