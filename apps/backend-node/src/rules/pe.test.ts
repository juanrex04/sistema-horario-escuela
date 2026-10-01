import { test } from "node:test";
import assert from "node:assert/strict";

import { calcularReglasPE, gradoBase, type BloqueInput } from "./pe.js";

const PE = 1;
const MATEMATICA = 2;

const secciones = [
  { id: 1, nombre: "Primaria" },
  { id: 2, nombre: "Middle School" },
  { id: 3, nombre: "Diploma" },
  { id: 4, nombre: "Preescolar Bajo" },
  { id: 5, nombre: "Preescolar Alto" },
];

/** Franjas reales de producción: los deportes de las 3 secciones caen en la tarde. */
const FRANJAS: Record<string, Record<string, [number, number]>> = {
  1: { 6: [750, 795], 7: [795, 840], 8: [840, 890] },
  2: { 6: [760, 800], 7: [800, 850], 8: [850, 895] },
  3: { 6: [760, 805], 7: [805, 850], 8: [850, 895] },
  4: { 4: [600, 640], 5: [640, 680], 6: [680, 720] },
};

let siguienteIdBloque = 1;
function bloquesDe(seccionId: number, dias: number[]): BloqueInput[] {
  return dias.flatMap((dia) =>
    Object.entries(FRANJAS[String(seccionId)]).map(([periodo, [ini, fin]]) => ({
      id: siguienteIdBloque++,
      seccionId,
      diaSemanaId: dia,
      numeroPeriodo: periodo,
      inicioMin: ini,
      finMin: fin,
      esAcademico: true,
    }))
  );
}

function curso(id: number, nombre: string, seccionId: number) {
  return { id, nombre, seccionId };
}

function carga(id: number, cursoId: number, profesorId: number, bloques = 2) {
  return { id, cursoId, materiaId: PE, profesorId, bloquesSemanalesRequeridos: bloques };
}

/* ------------------------------- gradoBase ------------------------------- */

test("gradoBase quita el sufijo de grupo", () => {
  assert.equal(gradoBase("2A"), "2");
  assert.equal(gradoBase("2B"), "2");
  assert.equal(gradoBase("11A"), "11");
  assert.equal(gradoBase("11B"), "11");
  assert.equal(gradoBase("6B"), "6");
});

test("gradoBase no colapsa grados sin letra", () => {
  assert.equal(gradoBase("10"), "10");
  assert.equal(gradoBase("12"), "12");
  assert.equal(gradoBase("Prekínder"), "Prekínder");
});

test("gradoBase no revienta con una entrada de una sola letra", () => {
  assert.equal(gradoBase("A"), "A");
  assert.equal(gradoBase("B"), "B");
  assert.equal(gradoBase(""), "");
});

test("gradoBase respeta tildes y espacios", () => {
  assert.equal(gradoBase("Transición A"), "Transición");
  assert.equal(gradoBase("Kínder B"), "Kínder");
  assert.equal(gradoBase("1 A"), "1");
  assert.equal(gradoBase("4to A"), "4to");
});

/* --------------------------- Regla A: franja --------------------------- */

test("Regla A: un límite por (sección, día) con el inicio de deporte más temprano de ESE DÍA entre las tres secciones", () => {
  siguienteIdBloque = 1;
  const bloques = [
    ...bloquesDe(1, [2, 4]), // Primaria: deporte 7 y 8
    ...bloquesDe(2, [1, 3]), // Middle: deporte 7 y 8
    ...bloquesDe(3, [1, 3]), // Diploma: deporte 7 y 8
  ];
  const deportes = [
    // Primary: 2 and 4
    { seccionId: 1, diaSemanaId: 2, numeroPeriodo: "7" },
    { seccionId: 1, diaSemanaId: 2, numeroPeriodo: "8" },
    { seccionId: 1, diaSemanaId: 4, numeroPeriodo: "7" },
    { seccionId: 1, diaSemanaId: 4, numeroPeriodo: "8" },
    // Middle: 1 and 3
    { seccionId: 2, diaSemanaId: 1, numeroPeriodo: "7" },
    { seccionId: 2, diaSemanaId: 1, numeroPeriodo: "8" },
    { seccionId: 2, diaSemanaId: 3, numeroPeriodo: "7" },
    { seccionId: 2, diaSemanaId: 3, numeroPeriodo: "8" },
    // Diploma: 1 and 3
    { seccionId: 3, diaSemanaId: 1, numeroPeriodo: "7" },
    { seccionId: 3, diaSemanaId: 1, numeroPeriodo: "8" },
    { seccionId: 3, diaSemanaId: 3, numeroPeriodo: "7" },
    { seccionId: 3, diaSemanaId: 3, numeroPeriodo: "8" },
  ];
  const r = calcularReglasPE({ secciones, bloques, deportes, cursos: [], materias: [], cargas: [], profesores: [] });

  // El deporte se cruza entre secciones: el día 1 y el 3 el más temprano es el de
  // Middle (800, antes que el de Diploma en 805) y el día 2 y el 4 es el de
  // Primaria (795). Ese límite del día se aplica a la P.E. de las TRES secciones.
  assert.deepEqual(r.deportesPEAntes, [
    { seccionId: 1, diaSemanaId: 1, inicioMin: 800 },
    { seccionId: 1, diaSemanaId: 2, inicioMin: 795 },
    { seccionId: 1, diaSemanaId: 3, inicioMin: 800 },
    { seccionId: 1, diaSemanaId: 4, inicioMin: 795 },
    { seccionId: 2, diaSemanaId: 1, inicioMin: 800 },
    { seccionId: 2, diaSemanaId: 2, inicioMin: 795 },
    { seccionId: 2, diaSemanaId: 3, inicioMin: 800 },
    { seccionId: 2, diaSemanaId: 4, inicioMin: 795 },
    { seccionId: 3, diaSemanaId: 1, inicioMin: 800 },
    { seccionId: 3, diaSemanaId: 2, inicioMin: 795 },
    { seccionId: 3, diaSemanaId: 3, inicioMin: 800 },
    { seccionId: 3, diaSemanaId: 4, inicioMin: 795 },
  ]);
  assert.deepEqual(r.advertencias, []);
});

test("Regla A: el deporte de otra sección restringe igual a la que no tiene deporte ese día", () => {
  siguienteIdBloque = 1;
  // El día 1 solo Middle tiene deporte, pero la P.E. de Primaria también queda
  // atada a esa franja: por eso el límite se toma entre las tres secciones y no
  // solo de la sección propia.
  const bloques = [...bloquesDe(1, [2]), ...bloquesDe(2, [1])];
  const deportes = [
    { seccionId: 1, diaSemanaId: 2, numeroPeriodo: "7" },
    { seccionId: 2, diaSemanaId: 1, numeroPeriodo: "7" },
  ];
  const r = calcularReglasPE({ secciones, bloques, deportes, cursos: [], materias: [], cargas: [], profesores: [] });

  assert.ok(
    r.deportesPEAntes.some((x) => x.seccionId === 1 && x.diaSemanaId === 1 && x.inicioMin === 800),
    "la P.E. de Primaria debe respetar el deporte de Middle el día 1"
  );
});

test("Regla A: un día sin deporte en las 3 secciones queda libre", () => {
  siguienteIdBloque = 1;
  const bloques = [...bloquesDe(1, [2, 4]), ...bloquesDe(2, [1, 3])];
  const deportes = [
    { seccionId: 1, diaSemanaId: 2, numeroPeriodo: "7" },
    { seccionId: 2, diaSemanaId: 1, numeroPeriodo: "7" },
  ];
  const r = calcularReglasPE({ secciones, bloques, deportes, cursos: [], materias: [], cargas: [], profesores: [] });

  // Solo hay deporte el día 1 (Middle) y el 2 (Primaria); el 3, 4 y 5 no se restringen.
  assert.deepEqual(r.deportesPEAntes, [
    { seccionId: 1, diaSemanaId: 1, inicioMin: 800 },
    { seccionId: 1, diaSemanaId: 2, inicioMin: 795 },
    { seccionId: 2, diaSemanaId: 1, inicioMin: 800 },
    { seccionId: 2, diaSemanaId: 2, inicioMin: 795 },
    { seccionId: 3, diaSemanaId: 1, inicioMin: 800 },
    { seccionId: 3, diaSemanaId: 2, inicioMin: 795 },
  ]);
});

test("Regla A: el deporte solo de Preescolar no restringe a nadie", () => {
  siguienteIdBloque = 1;
  const bloques = bloquesDe(4, [1, 3]);
  const deportes = [
    { seccionId: 4, diaSemanaId: 1, numeroPeriodo: "4" },
    { seccionId: 4, diaSemanaId: 3, numeroPeriodo: "5" },
  ];
  const r = calcularReglasPE({ secciones, bloques, deportes, cursos: [], materias: [], cargas: [], profesores: [] });

  assert.deepEqual(r.deportesPEAntes, []);
  assert.deepEqual(r.advertencias, []);
});

test("Regla A: sin deportes no se emite ninguna regla", () => {
  siguienteIdBloque = 1;
  const r = calcularReglasPE({
    secciones,
    bloques: bloquesDe(1, [1, 2, 3, 4, 5]),
    deportes: [],
    cursos: [],
    materias: [],
    cargas: [],
    profesores: [],
  });

  assert.deepEqual(r.deportesPEAntes, []);
  assert.deepEqual(r.advertencias, []);
});

test("Regla A: los deportes no contiguos generan advertencia", () => {
  siguienteIdBloque = 1;
  // Primary: deporte en el período 1 y en el 8, con huecos en el medio.
  const bloques = [
    {
      id: 900,
      seccionId: 1,
      diaSemanaId: 1,
      numeroPeriodo: "1",
      inicioMin: 420,
      finMin: 460,
      esAcademico: true,
    },
    {
      id: 901,
      seccionId: 1,
      diaSemanaId: 1,
      numeroPeriodo: "8",
      inicioMin: 840,
      finMin: 890,
      esAcademico: true,
    },
  ];
  const deportes = [
    { seccionId: 1, diaSemanaId: 1, numeroPeriodo: "1" },
    { seccionId: 1, diaSemanaId: 1, numeroPeriodo: "8" },
  ];
  const r = calcularReglasPE({ secciones, bloques, deportes, cursos: [], materias: [], cargas: [], profesores: [] });

  assert.equal(r.advertencias.length, 1);
  assert.match(r.advertencias[0], /no es contiguo/);
});

/* ---------------------------- Regla B: pares ---------------------------- */

const cursosPrimaria = [curso(1, "2A", 1), curso(2, "2B", 1), curso(3, "3A", 1), curso(4, "3B", 1)];
const cursosSecundaria = [
  curso(10, "11A", 3),
  curso(11, "11B", 3),
  curso(12, "10", 3),
  curso(13, "1A", 4),
  curso(14, "1B", 5),
];

function baseCalcular() {
  return {
    secciones,
    bloques: [],
    deportes: [],
    materias: [{ id: PE, esEducacionFisica: true }],
    cursos: [...cursosPrimaria, ...cursosSecundaria],
  };
}

test("Regla B: sin el flag no se empareja nada", () => {
  const r = calcularReglasPE({
    ...baseCalcular(),
    cargas: [carga(1, 1, 25), carga(2, 2, 25)],
    profesores: [{ id: 25, peParesMismoDia: false }],
  });

  assert.deepEqual(r.paresPEMismoDia, []);
});

test("Regla B: con el flag se emparejan los grupos del mismo grado", () => {
  const r = calcularReglasPE({
    ...baseCalcular(),
    cargas: [carga(1, 1, 25), carga(2, 2, 25), carga(3, 3, 25), carga(4, 4, 25)],
    profesores: [{ id: 25, peParesMismoDia: true }],
  });

  assert.deepEqual(r.paresPEMismoDia, [
    { cargaAId: 1, cargaBId: 2 },
    { cargaAId: 3, cargaBId: 4 },
  ]);
});

test("Regla B: no se empareja si la pareja es de otro docente", () => {
  // Caso 6A (Ricardo) / 6B (Viviana): con el flag solo en Ricardo, el par se pierde.
  const cursos = [curso(20, "6A", 1), curso(21, "6B", 1)];
  const r = calcularReglasPE({
    ...baseCalcular(),
    cursos,
    cargas: [carga(1, 20, 25), carga(2, 21, 40)],
    profesores: [
      { id: 25, peParesMismoDia: true },
      { id: 40, peParesMismoDia: false },
    ],
  });

  assert.deepEqual(r.paresPEMismoDia, []);
});

test("Regla B: no se empareja si los bloques semanales difieren", () => {
  const r = calcularReglasPE({
    ...baseCalcular(),
    cargas: [carga(1, 1, 25, 2), carga(2, 2, 25, 3)],
    profesores: [{ id: 25, peParesMismoDia: true }],
  });

  assert.deepEqual(r.paresPEMismoDia, []);
});

test("Regla B: exige exactamente dos grupos por grado", () => {
  const cursos = [curso(30, "5A", 1), curso(31, "5B", 1), curso(32, "5C", 1)];
  const r = calcularReglasPE({
    ...baseCalcular(),
    cursos,
    cargas: [carga(1, 30, 25), carga(2, 31, 25), carga(3, 32, 25)],
    profesores: [{ id: 25, peParesMismoDia: true }],
  });

  // Con tres grupos, "5" no es un par: la regla queda sin aplicar en lugar de
  // emparejar dos al azar.
  assert.deepEqual(r.paresPEMismoDia, []);
});

test("Regla B: un solo grupo en el grado no produce par", () => {
  const r = calcularReglasPE({
    ...baseCalcular(),
    cargas: [carga(1, 1, 25)],
    profesores: [{ id: 25, peParesMismoDia: true }],
  });

  assert.deepEqual(r.paresPEMismoDia, []);
});

test("Regla B: no empareja el mismo grado de secciones distintas", () => {
  // "1A" es de Preescolar Alto y "1B" de Preescolar Bajo: mismo grado, secciones
  // diferentes, así que no se emparejan.
  const r = calcularReglasPE({
    ...baseCalcular(),
    cargas: [carga(1, 13, 40), carga(2, 14, 40)],
    profesores: [{ id: 40, peParesMismoDia: true }],
  });

  assert.deepEqual(r.paresPEMismoDia, []);
});

test("Regla B: funciona en una sección distinta de Primaria", () => {
  const r = calcularReglasPE({
    ...baseCalcular(),
    cursos: [curso(10, "11A", 3), curso(11, "11B", 3)],
    cargas: [carga(1, 10, 56), carga(2, 11, 56)],
    profesores: [{ id: 56, peParesMismoDia: true }],
  });

  assert.deepEqual(r.paresPEMismoDia, [{ cargaAId: 1, cargaBId: 2 }]);
});

test("Regla B: los cursos sin letra (10, 12) no se emparejan entre sí", () => {
  const cursos = [curso(40, "10", 3), curso(41, "12", 3)];
  const r = calcularReglasPE({
    ...baseCalcular(),
    cursos,
    cargas: [carga(1, 40, 56), carga(2, 41, 56)],
    profesores: [{ id: 56, peParesMismoDia: true }],
  });

  assert.deepEqual(r.paresPEMismoDia, []);
});

test("Regla B: ignora las materias que no son P.E.", () => {
  const r = calcularReglasPE({
    ...baseCalcular(),
    materias: [{ id: PE, esEducacionFisica: true }],
    cargas: [
      { id: 1, cursoId: 1, materiaId: MATEMATICA, profesorId: 25, bloquesSemanalesRequeridos: 2 },
      { id: 2, cursoId: 2, materiaId: MATEMATICA, profesorId: 25, bloquesSemanalesRequeridos: 2 },
    ],
    profesores: [{ id: 25, peParesMismoDia: true }],
  });

  assert.deepEqual(r.paresPEMismoDia, []);
});

test("Regla B: el par se normaliza con el menor id primero", () => {
  const r = calcularReglasPE({
    ...baseCalcular(),
    cursos: [curso(1, "2A", 1), curso(2, "2B", 1)],
    cargas: [carga(9, 2, 25), carga(4, 1, 25)],
    profesores: [{ id: 25, peParesMismoDia: true }],
  });

  assert.deepEqual(r.paresPEMismoDia, [{ cargaAId: 4, cargaBId: 9 }]);
});

test("Regla B: no duplica el par", () => {
  const r = calcularReglasPE({
    ...baseCalcular(),
    cursos: [curso(1, "2A", 1), curso(2, "2B", 1)],
    cargas: [carga(1, 1, 25), carga(2, 2, 25)],
    profesores: [{ id: 25, peParesMismoDia: true }],
  });

  assert.equal(r.paresPEMismoDia.length, 1);
});
