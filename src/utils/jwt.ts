import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config/env.js";

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  email?: string;
}

export class JwtProvider {
  public static sign(payload: JwtPayload): string {
    const options: SignOptions = {
      expiresIn: config.jwt.expiresIn as any,
    };
    return jwt.sign(payload, config.jwt.secret, options);
  }

  public static verify(token: string): JwtPayload {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  }
}
