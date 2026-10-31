// NFR-07: writes a custom-format pg_dump of the dev database to backups/.
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = join("backups", `borrowhub-${timestamp}.dump`);

mkdirSync("backups", { recursive: true });
const output = openSync(outputPath, "w");

const result = spawnSync(
  "docker",
  ["compose", "exec", "-T", "postgres", "pg_dump", "-U", "borrowhub", "-d", "borrowhub", "-Fc"],
  { stdio: ["ignore", output, "inherit"] },
);
closeSync(output);

if (result.status !== 0) {
  unlinkSync(outputPath);
  console.error("Backup failed. Is the database running? Try: docker compose up -d");
  process.exit(1);
}

console.log(`Backup written to ${outputPath} (${statSync(outputPath).size} bytes).`);
