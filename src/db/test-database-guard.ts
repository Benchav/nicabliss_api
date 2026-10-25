import { config } from "../config/env.js";

export function assertTestDatabase(operation: string): void {
  if (config.nodeEnv !== "test" || config.turso.url !== "file:test.db") {
    throw new Error(`${operation} solo puede ejecutarse con NODE_ENV=test y file:test.db`);
  }
}
