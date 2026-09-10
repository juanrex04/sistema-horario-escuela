# Sistema de Gestión y Generación de Horarios Escolares

Monorepo para el cálculo automático de horarios escolares (CSP) en un colegio con 4 secciones (Preescolar, Primaria, Middle School, Diploma) y franjas horarias asimétricas.

## Estructura

```
├── apps/
│   ├── frontend/         # React (Vite) + Tailwind CSS + React Query
│   └── backend-node/     # Node.js + Express + TypeScript + Prisma ORM
├── services/
│   └── solver-python/    # Python + FastAPI + Google OR-Tools + Pydantic
├── docker-compose.yml    # PostgreSQL, backend, solver y frontend (Docker Desktop)
└── package.json          # workspaces npm (apps/*)
```

## Requisitos locales

- Node.js 20+ y npm
- Python 3.11+ (venv)
- PostgreSQL 16 local (o Docker Desktop)

## Usuario por defecto (seed)

- Email: `admin@colegio.local`
- Contraseña: `admin123`

## Configuración

1. Crear la base de datos `horarios` en PostgreSQL local:
   `createdb -U postgres horarios` (o `CREATE DATABASE horarios;` desde psql).

2. Copiar `.env.example` a `.env` en la raíz y ajustar credenciales.

3. Backend:
   ```
   cd apps/backend-node
   npm install
   npx prisma migrate dev
   npx prisma db seed
   npm run dev        # http://localhost:4000
   ```

4. Solver:
   ```
   cd services/solver-python
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   .venv\Scripts\uvicorn app.main:app --reload --port 8000
   ```

5. Frontend:
   ```
   cd apps/frontend
   npm install
   npm run dev        # http://localhost:5173
   ```

## Flujo de generación

1. El frontend envía `POST /api/timetables/generate` al backend.
2. El backend arma el payload (bloques en minutos absolutos) desde PostgreSQL.
3. El backend invoca `POST /solve` del microservicio Python (OR-Tools).
4. El solver resuelve el CSP y devuelve las asignaciones.
5. El backend persiste los `HorarioAsignado` y el frontend los muestra en el calendario.

## Docker (opcional)

Con Docker Desktop instalado:
```
docker compose up --build
```
- Postgres: `localhost:5432`
- Backend: `localhost:4000`
- Solver: `localhost:8000`
- Frontend: `localhost:5173`