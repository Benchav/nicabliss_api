import dotenv from "dotenv";

dotenv.config();

const isTest = process.env.NODE_ENV === "test" || process.argv.includes("--test");
const nodeEnv = isTest ? "test" : (process.env.NODE_ENV || "development");
const isProduction = nodeEnv === "production";
const defaultJwtSecret = "nicabliss_jwt_secret_key_2026";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio en producción`);
  return value;
}

function parseOrigins(value: string): string[] {
  const origins = value.split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean);
  if (origins.length === 0) throw new Error("CORS_ORIGIN debe contener al menos un origen");
  for (const origin of origins) {
    if (origin === "*") {
      if (isProduction) throw new Error("CORS_ORIGIN no puede usar '*' en producción");
      continue;
    }
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error(`CORS_ORIGIN contiene un origen inválido: ${origin}`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== "/") {
      throw new Error(`CORS_ORIGIN debe contener orígenes sin rutas: ${origin}`);
    }
    if (isProduction && parsed.protocol !== "https:") {
      throw new Error(`CORS_ORIGIN debe usar HTTPS en producción: ${origin}`);
    }
  }
  return origins;
}

function validateTimezone(value: string): string {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); }
  catch { throw new Error(`BUSINESS_TIMEZONE no es válida: ${value}`); }
  return value;
}

const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error("PORT debe ser un puerto válido");

const jwtSecret = isProduction ? required("JWT_SECRET") : (process.env.JWT_SECRET || defaultJwtSecret);
if (isProduction && (jwtSecret === defaultJwtSecret || jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET debe ser aleatorio y tener al menos 32 caracteres en producción");
}

const databaseUrl = isTest
  ? (process.env.TEST_DATABASE_URL || "file:test.db")
  : (isProduction ? required("TURSO_DATABASE_URL") : (process.env.TURSO_DATABASE_URL || "file:local.db"));
const authToken = isTest ? "" : (process.env.TURSO_AUTH_TOKEN || "").trim();

if (isTest && databaseUrl !== "file:test.db") {
  throw new Error("Las pruebas automatizadas requieren exactamente file:test.db");
}
if (isProduction && !databaseUrl.startsWith("libsql://")) {
  throw new Error("TURSO_DATABASE_URL debe usar libsql:// en producción");
}
if (/^(libsql|https?):\/\//i.test(databaseUrl) && !authToken) {
  throw new Error("TURSO_AUTH_TOKEN es obligatorio para una base remota");
}
if (isProduction && process.env.ALLOW_DEMO_SEED === "true") {
  throw new Error("ALLOW_DEMO_SEED no puede habilitarse en producción");
}

const corsValue = isProduction ? required("CORS_ORIGIN") : (process.env.CORS_ORIGIN || "http://localhost:5173");

export const config = {
  port,
  nodeEnv,
  isProduction,
  trustProxy: process.env.TRUST_PROXY === "true" || isProduction,
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  },
  cors: {
    origin: parseOrigins(corsValue),
  },
  turso: {
    url: databaseUrl,
    authToken,
  },
  database: {
    autoMigrate: process.env.AUTO_MIGRATE === "true",
    allowDemoSeed: isTest || process.env.ALLOW_DEMO_SEED === "true",
  },
  businessTimezone: validateTimezone(process.env.BUSINESS_TIMEZONE || "America/Managua"),
};
