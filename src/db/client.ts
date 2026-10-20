import { createClient, Client } from "@libsql/client";
import { config } from "../config/env.js";
import { Logger } from "../utils/logger.js";

let clientInstance: Client | null = null;

export function getDbClient(): Client {
  if (!clientInstance) {
    clientInstance = createClient({
      url: config.turso.url,
      authToken: config.turso.authToken,
    });
    const sanitizedUrl = config.turso.url.startsWith("libsql://")
      ? config.turso.url.replace(/^libsql:\/\//, "https://")
      : config.turso.url;
    Logger.info(`Cliente de base de datos inicializado -> [${sanitizedUrl}]`, "DATABASE");
  }
  return clientInstance;
}

export const dbClient = getDbClient();
