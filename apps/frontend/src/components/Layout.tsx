import { useEffect, useState, type ReactNode } from "react";
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
  Layers,
  Settings,
  Building2,
  DoorOpen,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";

const NOMBRE_COLEGIO = import.meta.env.VITE_SCHOOL_NAME ?? "Colegio";
const NOMBRE_PRODUCTO = "Gestor de horarios";

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
      { to: "/secciones", label: "Secciones", icon: Building2 },
      { to: "/materias", label: "Materias", icon: BookMarked },
      { to: "/departamentos", label: "Departamentos", icon: Layers },
      { to: "/cargas", label: "Cargas Académicas", icon: BookOpen },
      { to: "/bloques", label: "Configuración de Bloques", icon: CalendarClock },
      { to: "/espacios", label: "Espacios y Salas", icon: DoorOpen },
    ],
  },
  {
    label: "Reglas de negocio",
    items: [{ to: "/reglas", label: "Reuniones y Deportes", icon: Settings }],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    if (!menuAbierto) return;
    const cerrarConEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAbierto(false);
    };
    document.addEventListener("keydown", cerrarConEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", cerrarConEscape);
      document.body.style.overflow = "";
    };
  }, [menuAbierto]);

  return (
    <div className="flex min-h-screen bg-papel">
      {menuAbierto && (
        <div
          className="fixed inset-0 z-30 bg-tinta/40 lg:hidden"
          onClick={() => setMenuAbierto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-pizarra text-chalk transition-transform duration-200 motion-reduce:transition-none lg:static lg:translate-x-0 ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <School className="h-5 w-5 shrink-0 text-chalk" aria-hidden="true" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold tracking-tight text-chalk">
                {NOMBRE_COLEGIO}
              </p>
              <p className="truncate text-xs text-chalk-tenue">{NOMBRE_PRODUCTO}</p>
            </div>
          </div>
          <button
            onClick={() => setMenuAbierto(false)}
            className="-mr-1 rounded p-1 text-chalk-tenue hover:bg-white/10 hover:text-chalk focus-visible:outline-chalk lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-3 pb-1.5 text-[11px] font-medium text-chalk-tenue/70">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = location.pathname === item.to;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuAbierto(false)}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-chalk ${
                        active
                          ? "bg-white/10 text-chalk"
                          : "text-chalk-tenue hover:bg-white/5 hover:text-chalk"
                      }`}
                    >
                      {active && (
                        <span
                          className="absolute inset-y-1.5 left-0 w-0.5 bg-chalk"
                          aria-hidden="true"
                        />
                      )}
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="truncate px-2 pb-2 text-xs text-chalk-tenue">
            {user?.nombre}
            <span className="block truncate font-medium text-chalk">{user?.email}</span>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm font-medium text-chalk-tenue transition-colors hover:bg-white/5 hover:text-chalk focus-visible:outline-chalk"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-borde bg-superficie px-4 py-3 lg:hidden">
          <button
            onClick={() => setMenuAbierto(true)}
            className="-ml-1 rounded p-1.5 text-tinta-suave hover:bg-papel-hondo"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="truncate text-sm font-semibold tracking-tight">{NOMBRE_COLEGIO}</span>
        </header>
        <main className="flex-1 overflow-x-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
