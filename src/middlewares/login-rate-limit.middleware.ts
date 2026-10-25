import { createHash } from "crypto";
import { NextFunction, Request, Response } from "express";
import { config } from "../config/env.js";
import { dbClient } from "../db/client.js";

const WINDOW_MS = 15 * 60 * 1000;

function key(kind: "ip" | "user", value: string): string {
  return createHash("sha256").update(`${kind}:${value}`).digest("hex");
}

export async function loginRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const windowCutoff = new Date(now.getTime() - WINDOW_MS).toISOString();
  const cleanupCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const username = String(req.body?.usuario || req.body?.username || "").trim().toLowerCase();
  const limits = config.nodeEnv === "test"
    ? [{ limiterKey: key("ip", req.ip || "unknown"), limit: 1_000 }, { limiterKey: key("user", username), limit: 1_000 }]
    : [{ limiterKey: key("ip", req.ip || "unknown"), limit: 30 }, { limiterKey: key("user", username), limit: 10 }];

  const transaction = await dbClient.transaction("write");
  try {
    await transaction.execute({
      sql: "DELETE FROM auth_rate_limits WHERE updated_at < ?;",
      args: [cleanupCutoff],
    });
    for (const item of limits) {
      await transaction.execute({
        sql: `INSERT INTO auth_rate_limits (limiter_key, attempts, window_started_at, updated_at)
              VALUES (?, 1, ?, ?)
              ON CONFLICT(limiter_key) DO UPDATE SET
                attempts = CASE WHEN auth_rate_limits.window_started_at < ? THEN 1 ELSE auth_rate_limits.attempts + 1 END,
                window_started_at = CASE WHEN auth_rate_limits.window_started_at < ? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END,
                updated_at = excluded.updated_at;`,
        args: [item.limiterKey, nowIso, nowIso, windowCutoff, windowCutoff],
      });
    }
    const placeholders = limits.map(() => "?").join(", ");
    const result = await transaction.execute({
      sql: `SELECT limiter_key, attempts, window_started_at FROM auth_rate_limits WHERE limiter_key IN (${placeholders});`,
      args: limits.map((item) => item.limiterKey),
    });
    await transaction.commit();

    const blocked = result.rows.some((row) => {
      const configured = limits.find((item) => item.limiterKey === String(row.limiter_key));
      return configured && Number(row.attempts) > configured.limit;
    });
    if (blocked) {
      res.setHeader("Retry-After", String(Math.ceil(WINDOW_MS / 1000)));
      res.status(429).json({
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
        },
      });
      return;
    }
    next();
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    next(error);
  } finally {
    transaction.close();
  }
}
