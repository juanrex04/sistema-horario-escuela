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

## Reglas de educación física (P.E.)

Una materia queda marcada como P.E. con el campo `esEducacionFisica` de
**Materias**. Sobre esa marca el solver aplica estas reglas:

| Regla | Qué hace | Dónde vive | Secciones |
| --- | --- | --- | --- |
| Bloque de deporte reservado | Ninguna carga de la sección puede ocupar el bloque de deporte | `solver.py`, Bloqueos de deporte | Todas |
| **Regla A** | La P.E. no ocupa ningún bloque que se solape con la franja de deporte de **ninguna** de las tres secciones | `rules/pe.ts`, Regla A | Primaria, Middle School y Diploma |
| **Regla B** | Dos grupos de un mismo grado dictados por el mismo docente ven P.E. el mismo día | `rules/pe.ts`, Regla B | Las que indique el docente |

Todas son restricciones **duras**: si no se pueden cumplir, la generación
devuelve `INFEASIBLE` en vez de acomodar la carga en otro horario.

### Regla A: franja de deporte global

La P.E. de Primaria, Middle School y Diploma no puede coincidir en **horario**
con el deporte de ninguna de las tres, sin importar el día ni la sección. Se
resuelve con un único límite por día: el inicio de deporte más temprano de ese
día entre las tres secciones. El backend lo calcula en `src/rules/pe.ts` y lo
envía en `deportesPEAntes`:

```json
"deportesPEAntes": [{ "seccionId": 7, "diaSemanaIds": [11, 12, 13, 14], "limiteMin": 795 }]
```

El solver prohíbe todo bloque de esa sección, en esos días, que **termine
después** de `limiteMin` para las cargas de P.E.

Con la configuración actual el deporte ocupa los períodos 7 y 8 de la tarde en
las tres secciones (13:15-14:55), así que el límite global es 13:15 y en la
práctica:

| Sección | Períodos que quedan para P.E. en los días con deporte |
| --- | --- |
| Primaria | 1 a 6 |
| Middle School | 1 a 6 |
| Diploma | 1 a 5 |

El viernes no hay deporte en ninguna de las tres, así que ese día queda libre.

> Esta regla **absorbe a la anterior "Regla C"** (P.E. antes del deporte de su
> propia sección). El nuevo límite es igual o más estricto que los tres límites
> anteriores, así que la Regla C quedó sin efecto propio y se retiró de la
> documentación y del payload. Los tests 40-44 de `test_solver.py` la siguen
> cubriendo en el solver por si vuelve a activarse.

Si algún día el deporte de un día dejara de ser contiguo, un único `limiteMin`
sobre-excluiría también los huecos intermedios. Por eso `rules/pe.ts` emite una
advertencia en `advertencias` cuando detecta ese caso y el backend la registra
en consola.

### Regla B: pares de P.E. por docente

Es **opt-in por docente** mediante el campo `peParesMismoDia` de **Docentes**.
Cuando está activo, las cargas de P.E. del docente se agrupan por sección y grado
base (`11A` y `11B` comparten el grado `11`) y cada grupo de exactamente dos
cargas genera un par que debe verse el mismo día.

Reglas del agrupamiento:

- Solo entre cargas del **mismo docente**: si `6A` es de un docente y `6B` de
  otro, no se emparejan aunque ambos sean P.E. del mismo grado.
- La sección va en la clave: el grupo `1` de Preescolar Bajo no se empareja con
  el `1` de Preescolar Alto.
- Un grado con **exactamente dos** cargas se empareja; con una o con tres o más
  la regla no aplica en ese grado.
- Las cargas del par deben requerir los mismos bloques semanales.
- No exige que los dos grupos sean consecutivos en el horario; solo el mismo día.

La preferencia blanda de P.E. antes del bloque `LUNCH` (`numPEAntesLunch`) es
independiente de estas reglas y solo aplica si existe un bloque no académico con
`numeroPeriodo = "LUNCH"` para esa sección y día.

### Bloques fijos por carga

Una carga puede anclarse a bloques concretos desde **Cargas**, con el icono de
pin. Si tiene bloques fijos, el solver solo le permite ocupar esos bloques: la
carga queda atada al horario y las demás reglas no la desplazan. Para quitar
los fijados hay que guardar la selección vacía.

La cantidad de bloques fijos debe coincidir con los bloques semanales de la
carga; si no, la API responde `400` y si el bloque no existe o no pertenece a la
sección del curso también.

## Tests

El backend usa el runner de Node, sin dependencias extra:

```
npm test --workspace apps/backend-node
```

Cubre `src/rules/pe.ts` (Reglas A y B) en `src/rules/pe.test.ts`. El solver se
prueba con su propio script:

```
services\solver-python\.venv\Scripts\python.exe services\solver-python\test_solver.py
```

## Docker (opcional)

Con Docker Desktop instalado:
```
docker compose up --build
```
- Postgres: `localhost:5432`
- Backend: `localhost:4000`
- Solver: `localhost:8000`
- Frontend: `localhost:5173`