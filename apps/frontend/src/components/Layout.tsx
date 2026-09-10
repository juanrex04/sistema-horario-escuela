import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Users,
  BookOpen,
  CalendarClock,
  CalendarDays,
  LogOut,
  School,
  GraduationCap,
  BookMarked,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";

type NavItem = { to: string; label: string; icon: LucideIcon };

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operación",
    items: [{ to: "/horario", label: "Horario Generado", icon: CalendarDays }],
  },
  {
    label: "Catálogos",
    items: [
      { to: "/docentes", label: "Docentes", icon: Users },
      { to: "/cursos", label: "Cursos", icon: GraduationCap },
      { to: "/materias", label: "Materias", icon: BookMarked },
      { to: "/cargas", label: "Cargas Académicas", icon: BookOpen },
      { to: "/bloques", label: "Configuración de Bloques", icon: CalendarClock },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <School className="h-6 w-6 text-indigo-600" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Gestor de Horarios</p>
            <p className="text-xs text-slate-500">Colegio</p>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = location.pathname === item.to;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="px-2 pb-2 text-xs text-slate-500">
            {user?.nombre}
            <span className="block font-medium text-slate-700">{user?.email}</span>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}