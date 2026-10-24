import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config/env.js";

if (config.nodeEnv !== "test") {
  throw new Error("prepare-test solo puede ejecutarse con NODE_ENV=test");
}

if (!config.turso.url.startsWith("file:")) {
  throw new Error("Las pruebas requieren una base LibSQL local con URL file:");
}

const databasePath = config.turso.url.slice("file:".length);
const absolutePath = path.isAbsolute(databasePath)
  ? databasePath
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..", databasePath);

for (const suffix of ["", "-shm", "-wal"]) {
  const candidate = `${absolutePath}${suffix}`;
  if (fs.existsSync(candidate)) {
    fs.rmSync(candidate, { force: true });
  }
}
