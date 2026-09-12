import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import catalogoRoutes from "./routes/catalogos.js";
import reglasRoutes from "./routes/reglas.js";
import timetableRoutes from "./routes/timetable.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", servicio: "backend-node" });
});

app.use("/api/auth", authRoutes);
app.use("/api", catalogoRoutes);
app.use("/api", reglasRoutes);
app.use("/api/timetables", timetableRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = err.status ?? 500;
  res.status(status).json({ error: (err as Error).message || "Error interno del servidor" });
});

app.listen(config.port, () => {
  console.log(`[backend-node] escuchando en http://localhost:${config.port}`);
});