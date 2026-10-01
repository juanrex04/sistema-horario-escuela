import { useState } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "../lib/auth";

const NOMBRE_COLEGIO = import.meta.env.VITE_SCHOOL_NAME ?? "Colegio";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@colegio.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-tinta outline-none transition-colors placeholder:text-tenue focus:border-pizarra";

  return (
    <div className="flex min-h-screen items-center justify-center bg-papel p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm border border-borde bg-superficie p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">{NOMBRE_COLEGIO}</h1>
          <p className="mt-0.5 text-sm text-apagado">Gestor de horarios</p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-tinta-suave">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-tinta-suave">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-tiza">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 bg-pizarra px-4 py-2 text-sm font-medium text-chalk transition-colors hover:bg-pizarra-hondo disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </div>
      </form>
    </div>
  );
}
