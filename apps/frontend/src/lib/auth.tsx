import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken } from "../lib/api";

type User = { id: number; email: string; nombre: string; rol: string };

type AuthContextValue = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readUser(): User | null {
  const raw = localStorage.getItem("st_user");
  return raw ? (JSON.parse(raw) as User) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readUser());

  useEffect(() => {
    const saved = readUser();
    if (saved) setUser(saved);
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
    setToken(res.token);
    localStorage.setItem("st_user", JSON.stringify(res.user));
    setUser(res.user);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("st_user");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}