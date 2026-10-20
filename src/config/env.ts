import dotenv from "dotenv";
dotenv.config();

const isTest = process.env.NODE_ENV === "test" || process.argv.includes("--test");

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: isTest ? "test" : (process.env.NODE_ENV || "development"),
  jwt: {
    secret: process.env.JWT_SECRET || "nicabliss_jwt_secret_key_2026",
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  },
  cors: {
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map(o => o.trim()),
  },
  turso: {
    url: isTest ? "file:test.db" : (process.env.TURSO_DATABASE_URL || "file:local.db"),
    authToken: isTest ? "" : (process.env.TURSO_AUTH_TOKEN || ""),
  },
};
