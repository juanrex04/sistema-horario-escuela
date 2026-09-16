import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Color, PDFFont, PDFPage } from "pdf-lib";
import type { Prisma } from "@prisma/client";

export type AsignacionCompleta = Prisma.HorarioAsignadoGetPayload<{
  include: {
    bloqueHorario: { include: { seccion: true; diaSemana: true } };
    cargaAcademica: { include: { curso: { include: { seccion: true } }; materia: true; profesor: true } };
  };
}>;

export type ReunionCompleta = Prisma.ReunionSeccionGetPayload<{ include: { secciones: true } }>;
export type ProfesorCompleto = Prisma.ProfesorGetPayload<{ include: { seccionBase: true } }>;
type BloqueT = Prisma.BloqueHorarioGetPayload<{}>;

export interface PdfParams {
  seccion: { id: number; nombre: string };
  asignaciones: AsignacionCompleta[];
  bloques: BloqueT[];
  cursos: Prisma.CursoGetPayload<{}>[];
  profesores: ProfesorCompleto[];
  reuniones: ReunionCompleta[];
  deportes: Prisma.DeporteSeccionGetPayload<{}>[];
  colaborativas: {
    diaSemanaId: number;
    horaInicio: string;
    horaFin: string;
    departamentoId: number;
    departamento: { id: number; nombre: string };
  }[];
  dias: { id: number; numeroDia: number }[];
}

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGEN = 30;
const ANCHO_TABLA = PAGE_W - MARGEN * 2;
const ANCHO_COL_TIEMPO = 62;
const ANCHO_COL_DIA = (ANCHO_TABLA - ANCHO_COL_TIEMPO) / 5;
const PAD_H = 4;
const PAD_V = 3;
const ALTURA_ENCABEZADO = 20;
const TOP_TABLA = PAGE_H - 64;

const C = {
  titulo: rgb(0.16, 0.18, 0.24),
  encabezadoTexto: rgb(0.34, 0.36, 0.42),
  encabezadoRelleno: rgb(0.955, 0.96, 0.98),
  linea: rgb(0.83, 0.84, 0.88),
  clase: { relleno: rgb(0.9, 0.92, 1.0), texto: rgb(0.27, 0.31, 0.48) },
  recreo: { relleno: rgb(1.0, 0.95, 0.85), texto: rgb(0.55, 0.33, 0.04) },
  deporte: { relleno: rgb(0.85, 0.97, 0.91), texto: rgb(0.11, 0.42, 0.26) },
  reunion: { relleno: rgb(0.94, 0.89, 0.99), texto: rgb(0.4, 0.24, 0.55) },
  colaborativa: { relleno: rgb(1.0, 0.92, 0.85), texto: rgb(0.6, 0.28, 0.05) },
  libre: rgb(0.52, 0.53, 0.58),
};

interface TextoLinea {
  texto: string;
  size: number;
  negrita: boolean;
  color: Color;
}

interface Celda {
  lineas: TextoLinea[];
  relleno: Color | null;
}

interface Fila {
  etiquetas: TextoLinea[];
  celdas: (Celda | null)[];
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function solapa(t1: string, f1: string, t2: string, f2: string): boolean {
  return toMinutes(t1) < toMinutes(f2) && toMinutes(t2) < toMinutes(f1);
}

function wrapTexto(font: PDFFont, texto: string, size: number, maxW: number): string[] {
  const palabras = texto.split(/\s+/);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const candidato = actual ? `${actual} ${p}` : p;
    if (!actual || font.widthOfTextAtSize(candidato, size) <= maxW) {
      actual = candidato;
    } else {
      lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  const res: string[] = [];
  for (const l of lineas) {
    if (font.widthOfTextAtSize(l, size) <= maxW) {
      res.push(l);
      continue;
    }
    let s = l;
    while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
    res.push(s);
  }
  return res;
}

function prepararCelda(fontNormal: PDFFont, fontBold: PDFFont, celda: Celda | null, maxW: number): Celda | null {
  if (!celda) return null;
  const lineas: TextoLinea[] = [];
  for (const l of celda.lineas) {
    const f = l.negrita ? fontBold : fontNormal;
    for (const seg of wrapTexto(f, l.texto, l.size, maxW)) {
      lineas.push({ texto: seg, size: l.size, negrita: l.negrita, color: l.color });
    }
  }
  return { lineas, relleno: celda.relleno };
}

function altoCelda(c: Celda): number {
  const contenido = c.lineas.reduce((s, l) => s + l.size + 2, 0);
  return Math.max(14, contenido + PAD_V * 2);
}

function dibujarCelda(page: PDFPage, fontNormal: PDFFont, fontBold: PDFFont, x: number, xMax: number, yBot: number, h: number, celda: Celda) {
  if (celda.relleno) {
    page.drawRectangle({ x, y: yBot, width: xMax - x, height: h, color: celda.relleno });
  }
  let y = yBot + h - PAD_V;
  for (const l of celda.lineas) {
    y -= l.size + 2;
    const f = l.negrita ? fontBold : fontNormal;
    page.drawText(l.texto, { x: x + PAD_H, y, size: l.size, font: f, color: l.color });
  }
}

function dibujarLinea(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color: Color, grosor = 0.6) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: grosor, color });
}

const NOMBRES_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function fechaGenerado(): string {
  return new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function encabezadoPagina(page: PDFPage, fontBold: PDFFont, fontNormal: PDFFont, titulo: string, subtitulo: string) {
  page.drawText(titulo, { x: MARGEN, y: PAGE_H - 32, size: 14, font: fontBold, color: C.titulo });
  page.drawText(subtitulo, { x: MARGEN, y: PAGE_H - 46, size: 9, font: fontNormal, color: C.encabezadoTexto });
  dibujarLinea(page, MARGEN, PAGE_H - 54, PAGE_W - MARGEN, PAGE_H - 54, C.linea, 0.8);
}

function piePagina(page: PDFPage, fontNormal: PDFFont, texto: string) {
  page.drawText(texto, { x: MARGEN, y: 24, size: 8, font: fontNormal, color: C.libre });
}

function dibujarTabla(page: PDFPage, fontNormal: PDFFont, fontBold: PDFFont, yIni: number, filas: Fila[]) {
  const xIni = MARGEN;
  const xFin = MARGEN + ANCHO_TABLA;
  const colX = new Array(6).fill(0);
  colX[0] = xIni;
  colX[1] = xIni + ANCHO_COL_TIEMPO;
  for (let d = 1; d <= 5; d++) colX[d + 1] = colX[1] + ANCHO_COL_DIA * d;

  for (let d = 0; d < 5; d++) {
    const x = colX[1] + ANCHO_COL_DIA * d;
    page.drawRectangle({ x, y: yIni - ALTURA_ENCABEZADO, width: ANCHO_COL_DIA, height: ALTURA_ENCABEZADO, color: C.encabezadoRelleno });
    page.drawText(NOMBRES_DIAS[d], {
      x: x + (ANCHO_COL_DIA - fontBold.widthOfTextAtSize(NOMBRES_DIAS[d], 10)) / 2,
      y: yIni - ALTURA_ENCABEZADO + 6,
      size: 10,
      font: fontBold,
      color: C.encabezadoTexto,
    });
  }
  dibujarLinea(page, xIni, yIni - ALTURA_ENCABEZADO, xFin, yIni - ALTURA_ENCABEZADO, C.linea, 0.8);

  const celdasPreparadas: (Celda | null)[][] = [];
  const altos: number[] = [];
  for (const fila of filas) {
    const prepFila: (Celda | null)[] = [prepararCelda(fontNormal, fontBold, { lineas: fila.etiquetas, relleno: null }, ANCHO_COL_TIEMPO - PAD_H * 2)];
    let alto = altoCelda(prepFila[0]!);
    for (let d = 0; d < 5; d++) {
      const celda = prepararCelda(fontNormal, fontBold, fila.celdas[d] ?? null, ANCHO_COL_DIA - PAD_H * 2);
      prepFila.push(celda);
      if (celda) alto = Math.max(alto, altoCelda(celda));
    }
    celdasPreparadas.push(prepFila);
    altos.push(alto);
  }

  const total = altos.reduce((s, a) => s + a, 0);
  const disponible = yIni - ALTURA_ENCABEZADO - total - MARGEN;
  if (total > disponible) {
    const factor = disponible / total;
    for (let i = 0; i < altos.length; i++) altos[i] = Math.max(14, Math.floor(altos[i] * factor));
  }

  let y = yIni - ALTURA_ENCABEZADO;
  const yFin = y - altos.reduce((s, a) => s + a, 0);
  for (let r = 0; r < filas.length; r++) {
    const h = altos[r];
    const filaPrep = celdasPreparadas[r];
    dibujarCelda(page, fontNormal, fontBold, colX[0], colX[1], y - h, h, filaPrep[0]!);
    for (let d = 0; d < 5; d++) {
      const celda = filaPrep[d + 1];
      if (celda) dibujarCelda(page, fontNormal, fontBold, colX[d + 1], colX[d + 2], y - h, h, celda);
    }
    dibujarLinea(page, xIni, y - h, xFin, y - h, C.linea, 0.4);
    y -= h;
  }
  for (let i = 1; i < colX.length - 1; i++) {
    dibujarLinea(page, colX[i], yIni - ALTURA_ENCABEZADO, colX[i], yFin, C.linea, 0.3);
  }
}

function bloquesPorDia(bloques: BloqueT[], seccionId: number): Map<number, BloqueT[]> {
  const m = new Map<number, BloqueT[]>();
  for (const b of bloques) {
    if (b.seccionId !== seccionId) continue;
    const arr = m.get(b.diaSemanaId) ?? [];
    arr.push(b);
    m.set(b.diaSemanaId, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => toMinutes(a.horaInicio) - toMinutes(b.horaInicio));
  return m;
}

function bloquesUnicosDocente(params: Pick<PdfParams, "asignaciones" | "bloques">, profesorId: number, seccionBaseId: number): Map<number, BloqueT[]> {
  const porFranja = new Map<string, BloqueT>();
  const agregar = (b: BloqueT) => {
    const k = `${b.diaSemanaId}|${b.horaInicio}|${b.horaFin}`;
    if (!porFranja.has(k)) porFranja.set(k, b);
  };
  for (const a of params.asignaciones) {
    if (a.cargaAcademica.profesor.id !== profesorId) continue;
    agregar(a.bloqueHorario);
  }
  for (const b of params.bloques) {
    if (b.seccionId !== seccionBaseId) continue;
    agregar(b);
  }
  const m = new Map<number, BloqueT[]>();
  for (const b of porFranja.values()) {
    const arr = m.get(b.diaSemanaId) ?? [];
    arr.push(b);
    m.set(b.diaSemanaId, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => toMinutes(a.horaInicio) - toMinutes(b.horaInicio));
  return m;
}

function filasDeBloques(
  dias: number[],
  m: Map<number, BloqueT[]>,
  resolver: (dia: number, b: BloqueT) => Celda | null
): Fila[] {
  const nFilas = dias.reduce((s, d) => Math.max(s, (m.get(d) ?? []).length), 0);
  const filas: Fila[] = [];
  for (let r = 0; r < nFilas; r++) {
    const bRef = dias.map((d) => (m.get(d) ?? [])[r]).find((x) => x) as BloqueT | undefined;
    const etiquetas: TextoLinea[] = bRef
      ? [
          { texto: bRef.numeroPeriodo, size: 8, negrita: true, color: C.encabezadoTexto },
          { texto: `${bRef.horaInicio}-${bRef.horaFin}`, size: 7, negrita: false, color: C.libre },
        ]
      : [];
    const celdas = dias.map((d) => {
      const arr = m.get(d) ?? [];
      if (r >= arr.length) return null;
      return resolver(d, arr[r]);
    });
    filas.push({ etiquetas, celdas });
  }
  return filas;
}

function paginaCurso(
  doc: PDFDocument,
  fontNormal: PDFFont,
  fontBold: PDFFont,
  seccionNombre: string,
  curso: Prisma.CursoGetPayload<{}>,
  mBloques: Map<number, BloqueT[]>,
  clasePorBloque: Map<string, AsignacionCompleta[]>,
  deportes: Prisma.DeporteSeccionGetPayload<{}>[],
  nPagina: number,
  total: number
) {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  encabezadoPagina(page, fontBold, fontNormal, `Horario · Curso ${curso.nombre}`, `Sección: ${seccionNombre} · Generado: ${fechaGenerado()}`);

  const resolver = (dia: number, b: BloqueT): Celda => {
    const asignaciones = clasePorBloque.get(`${dia}-${b.numeroPeriodo}`);
    if (asignaciones && asignaciones.length > 0) {
      const lineas: TextoLinea[] = [];
      for (const a of asignaciones) {
        lineas.push({ texto: a.cargaAcademica.materia.nombre, size: 9, negrita: true, color: C.clase.texto });
        lineas.push({
          texto: `${a.cargaAcademica.profesor.nombre} · ${a.bloqueHorario.horaInicio}-${a.bloqueHorario.horaFin}`,
          size: 7,
          negrita: false,
          color: C.clase.texto,
        });
      }
      return { lineas, relleno: C.clase.relleno };
    }
    const deporte = deportes.some((d) => d.seccionId === curso.seccionId && d.diaSemanaId === dia && d.numeroPeriodo === b.numeroPeriodo);
    if (deporte) {
      return {
        relleno: C.deporte.relleno,
        lineas: [
          { texto: "Día de deportes", size: 9, negrita: true, color: C.deporte.texto },
          { texto: "Bloque reservado", size: 7, negrita: false, color: C.deporte.texto },
        ],
      };
    }
    if (!b.esAcademico) {
      return {
        relleno: C.recreo.relleno,
        lineas: [
          { texto: b.numeroPeriodo, size: 8, negrita: true, color: C.recreo.texto },
          { texto: `${b.horaInicio}-${b.horaFin} · Recreo`, size: 7, negrita: false, color: C.recreo.texto },
        ],
      };
    }
    return { relleno: null, lineas: [{ texto: "Libre", size: 8, negrita: false, color: C.libre }] };
  };

  const dias = [...mBloques.keys()].sort((a, b) => a - b);
  const filas = filasDeBloques(dias, mBloques, resolver);
  dibujarTabla(page, fontNormal, fontBold, TOP_TABLA, filas);
  piePagina(page, fontNormal, `Página ${nPagina} de ${total} · Curso ${curso.nombre}`);
}

function paginaProfesor(
  doc: PDFDocument,
  fontNormal: PDFFont,
  fontBold: PDFFont,
  profesor: ProfesorCompleto,
  mBloques: Map<number, BloqueT[]>,
  clasesProfesor: AsignacionCompleta[],
  reuniones: ReunionCompleta[],
  colaborativas: PdfParams["colaborativas"],
  nPagina: number,
  total: number
) {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  encabezadoPagina(
    page,
    fontBold,
    fontNormal,
    `Horario · Docente ${profesor.nombre}`,
    `Sección base: ${profesor.seccionBase.nombre} · Generado: ${fechaGenerado()}`
  );

  const resolver = (dia: number, b: BloqueT): Celda => {
    const reu = reuniones.find(
      (r) =>
        r.secciones.some((s) => s.id === profesor.seccionBaseId) &&
        r.diaSemanaId === dia &&
        solapa(b.horaInicio, b.horaFin, r.horaInicio, r.horaFin)
    );
    const col = colaborativas.find(
      (co) =>
        co.departamentoId === profesor.departamentoId &&
        co.diaSemanaId === dia &&
        solapa(b.horaInicio, b.horaFin, co.horaInicio, co.horaFin)
    );
    if (reu) {
      return {
        relleno: C.reunion.relleno,
        lineas: [
          { texto: "Reunión de sección", size: 8, negrita: true, color: C.reunion.texto },
          { texto: `${reu.horaInicio}-${reu.horaFin}`, size: 7, negrita: false, color: C.reunion.texto },
        ],
      };
    }
    if (col) {
      return {
        relleno: C.colaborativa.relleno,
        lineas: [
          { texto: "Colaborativa", size: 8, negrita: true, color: C.colaborativa.texto },
          { texto: `${col.departamento.nombre} · ${col.horaInicio}-${col.horaFin}`, size: 7, negrita: false, color: C.colaborativa.texto },
        ],
      };
    }
    const clases = clasesProfesor.filter(
      (a) =>
        a.bloqueHorario.diaSemanaId === dia &&
        a.bloqueHorario.horaInicio === b.horaInicio &&
        a.bloqueHorario.horaFin === b.horaFin
    );
    if (clases.length > 0) {
      const lineas: TextoLinea[] = [];
      for (const a of clases) {
        lineas.push({ texto: a.cargaAcademica.materia.nombre, size: 9, negrita: true, color: C.clase.texto });
        lineas.push({
          texto: `${a.cargaAcademica.curso.nombre} · ${a.bloqueHorario.horaInicio}-${a.bloqueHorario.horaFin}`,
          size: 7,
          negrita: false,
          color: C.clase.texto,
        });
      }
      return { lineas, relleno: C.clase.relleno };
    }
    if (!b.esAcademico) {
      return {
        relleno: C.recreo.relleno,
        lineas: [
          { texto: b.numeroPeriodo, size: 8, negrita: true, color: C.recreo.texto },
          { texto: `${b.horaInicio}-${b.horaFin} · Recreo`, size: 7, negrita: false, color: C.recreo.texto },
        ],
      };
    }
    return { relleno: null, lineas: [{ texto: "Libre", size: 8, negrita: false, color: C.libre }] };
  };

  const dias = [...mBloques.keys()].sort((a, b) => a - b);
  const filas = filasDeBloques(dias, mBloques, resolver);
  dibujarTabla(page, fontNormal, fontBold, TOP_TABLA, filas);

  const leyenda = [
    { texto: "Clase", color: C.clase.relleno },
    { texto: "Recreo", color: C.recreo.relleno },
    { texto: "Día de deportes", color: C.deporte.relleno },
    { texto: "Reunión", color: C.reunion.relleno },
    { texto: "Colaborativa", color: C.colaborativa.relleno },
  ];
  let lx = MARGEN + 8;
  for (const l of leyenda) {
    const w = fontNormal.widthOfTextAtSize(l.texto, 7);
    page.drawRectangle({ x: lx, y: 34, width: 8, height: 8, color: l.color });
    page.drawRectangle({ x: lx, y: 34, width: 8, height: 8, borderColor: C.linea, borderWidth: 0.4 });
    page.drawText(l.texto, { x: lx + 11, y: 35, size: 7, font: fontNormal, color: C.encabezadoTexto });
    lx += 11 + w + 12;
  }
  piePagina(page, fontNormal, `Página ${nPagina} de ${total} · Docente ${profesor.nombre}`);
}

export async function generarPdfSeccion(params: PdfParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontNormal = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const cursosConHorario = params.cursos
    .filter((c) => c.seccionId === params.seccion.id && params.asignaciones.some((a) => a.cargaAcademica.cursoId === c.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const profesoresEnSeccion = new Map<number, ProfesorCompleto>();
  for (const a of params.asignaciones) {
    if (a.cargaAcademica.curso.seccionId === params.seccion.id) {
      const prof = params.profesores.find((p) => p.id === a.cargaAcademica.profesor.id);
      if (prof) profesoresEnSeccion.set(prof.id, prof);
    }
  }
  const profesores = [...profesoresEnSeccion.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const totalPaginas = cursosConHorario.length + profesores.length;
  let nPagina = 0;

  for (const curso of cursosConHorario) {
    nPagina += 1;
    const clasePorBloque = new Map<string, AsignacionCompleta[]>();
    for (const a of params.asignaciones) {
      if (a.cargaAcademica.curso.id !== curso.id) continue;
      const key = `${a.bloqueHorario.diaSemanaId}-${a.bloqueHorario.numeroPeriodo}`;
      const arr = clasePorBloque.get(key) ?? [];
      arr.push(a);
      clasePorBloque.set(key, arr);
    }
    for (const arr of clasePorBloque.values()) arr.sort((a, b) => a.cargaAcademica.materia.nombre.localeCompare(b.cargaAcademica.materia.nombre, "es"));
    const mBloques = bloquesPorDia(params.bloques, curso.seccionId);
    paginaCurso(doc, fontNormal, fontBold, params.seccion.nombre, curso, mBloques, clasePorBloque, params.deportes, nPagina, totalPaginas);
  }

  for (const profesor of profesores) {
    nPagina += 1;
    const mBloques = bloquesUnicosDocente(params, profesor.id, profesor.seccionBaseId);
    const clasesProfesor = params.asignaciones.filter((a) => a.cargaAcademica.profesor.id === profesor.id);
    paginaProfesor(doc, fontNormal, fontBold, profesor, mBloques, clasesProfesor, params.reuniones, params.colaborativas, nPagina, totalPaginas);
  }

  return doc.save();
}

export function nombreArchivoSeccion(nombre: string): string {
  return `horario-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}