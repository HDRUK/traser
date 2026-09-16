#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = process.argv[2] ?? path.join(root, ".env");
const pinsPath = path.join(root, "tests", "regression", "pins.json");

const { locations } = JSON.parse(await readFile(pinsPath, "utf8"));

let env = "";
try {
  env = await readFile(envPath, "utf8");
} catch {
  process.stderr.write(`apply-regression-pins: ${envPath} not found — run \`cp env.example .env\` first.\n`);
  process.exit(1);
}

for (const [key, value] of Object.entries(locations)) {
  const line = new RegExp(`^${key}=.*$`, "m");
  env = line.test(env) ? env.replace(line, `${key}=${value}`) : `${env.replace(/\n*$/, "\n")}${key}=${value}\n`;
  process.stdout.write(`${key}=${value}\n`);
}

await writeFile(envPath, env, "utf8");
