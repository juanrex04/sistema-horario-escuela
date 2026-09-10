from fastapi import FastAPI
from .schemas import SolveRequest, SolveResponse
from .solver import solve

app = FastAPI(
    title="School Timetabling Solver",
    description="Microservicio stateless que resuelve el CSP de horarios escolares con Google OR-Tools.",
    version="0.1.0",
)


@app.get("/health")
def health():
    return {"status": "ok", "servicio": "solver-python"}


@app.post("/solve", response_model=SolveResponse)
def solve_endpoint(payload: SolveRequest):
    return solve(payload)