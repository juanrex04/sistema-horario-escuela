import "dotenv/config";
import type { SignOptions } from "jsonwebtoken";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? "1d") as SignOptions["expiresIn"],
  solverUrl: process.env.SOLVER_URL ?? "http://localhost:8000",
};