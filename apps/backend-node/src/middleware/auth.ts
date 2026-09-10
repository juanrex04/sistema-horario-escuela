import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; email: string; nombre: string; rol: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token no proporcionado" });
    return;
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as { id: number; email: string; nombre: string; rol: string };
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}