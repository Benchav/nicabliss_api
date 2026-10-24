import dotenv from "dotenv";
dotenv.config();

const isTest = process.env.NODE_ENV === "test" || process.argv.includes("--test");
const nodeEnv = isTest ? "test" : (process.env.NODE_ENV || "development");
const defaultJwtSecret = "nicabliss_jwt_secret_key_2026";
const jwtSecret = process.env.JWT_SECRET || defaultJwtSecret;

if (nodeEnv === "production" && jwtSecret === defaultJwtSecret) {
  throw new Error("JWT_SECRET es obligatorio y no puede usar el valor predeterminado en producción");
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv,
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  },
  cors: {
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map(o => o.trim()),
  },
  turso: {
    url: isTest
      ? (process.env.TEST_DATABASE_URL || "file:test.db")
      : (process.env.TURSO_DATABASE_URL || "file:local.db"),
    authToken: isTest ? "" : (process.env.TURSO_AUTH_TOKEN || ""),
  },
  database: {
    autoMigrate: process.env.AUTO_MIGRATE === "true",
    allowDemoSeed: isTest || process.env.ALLOW_DEMO_SEED === "true",
  },
  businessTimezone: process.env.BUSINESS_TIMEZONE || "America/Managua",
};

if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
  console.warn(
    "[NICABLISS VERCEL WARNING] TURSO_DATABASE_URL no está configurada en las variables de entorno de Vercel. " +
    "Asegúrese de definir TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en el Dashboard de Vercel."
  );
}
