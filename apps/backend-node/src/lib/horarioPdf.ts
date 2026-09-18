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

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGEN = 28;

const TOP_RESUMEN = PAGE_H - 96; // altura reservada para título + barra resumen
const TOP_COLUMNAS = TOP_RESUMEN - 34; // donde arrancan los encabezados de día
const Y_MIN = 40; // margen inferior antes de la leyenda / pie

const PAD_H = 7;
const PAD_V = 5;
const ALTURA_MIN_TARJETA = 26;

const C = {
  titulo: rgb(0.13, 0.15, 0.21),
  subtitulo: rgb(0.45, 0.47, 0.53),
  encabezadoDia: rgb(0.2, 0.22, 0.28),
  linea: rgb(0.85, 0.86, 0.9),
  divisorPunteado: rgb(0.86, 0.72, 0.35),
  fondoViernes: rgb(0.995, 0.98, 0.93),

  homeroom: { relleno: rgb(0.99, 0.93, 0.78), texto: rgb(0.55, 0.35, 0.06) },
  clase: { relleno: rgb(0.9, 0.92, 1.0), texto: rgb(0.27, 0.31, 0.48) },
  recreo: { relleno: rgb(1.0, 0.95, 0.85), texto: rgb(0.55, 0.33, 0.04) },
  deporte: { relleno: rgb(0.85, 0.97, 0.91), texto: rgb(0.11, 0.42, 0.26) },
  reunion: { relleno: rgb(0.94, 0.89, 0.99), texto: rgb(0.4, 0.24, 0.55) },
  colaborativa: { relleno: rgb(1.0, 0.92, 0.85), texto: rgb(0.6, 0.28, 0.05) },
  libre: rgb(0.6, 0.61, 0.65),
};

interface TextoLinea {
  texto: string;
  size: number;
  negrita: boolean;
  color: Color;
}

// Una tarjeta = un bloque de tiempo dibujado como rectángulo redondeado
interface Tarjeta {
  lineas: TextoLinea[];
  relleno: Color;
  textoColor: Color;
  esHomeroom?: boolean;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

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

function prepararTarjeta(fontNormal: PDFFont, fontBold: PDFFont, tarjeta: Tarjeta, maxW: number): Tarjeta {
  const lineas: TextoLinea[] = [];
  for (const l of tarjeta.lineas) {
    const f = l.negrita ? fontBold : fontNormal;
    for (const seg of wrapTexto(f, l.texto, l.size, maxW)) {
      lineas.push({ texto: seg, size: l.size, negrita: l.negrita, color: l.color });
    }
  }
  return { ...tarjeta, lineas };
}

function altoTarjeta(t: Tarjeta): number {
  const contenido = t.lineas.reduce((s, l) => s + l.size + 2.5, 0);
  return Math.max(ALTURA_MIN_TARJETA, contenido + PAD_V * 2);
}

// Dibuja una celda de cuadrícula: rectángulo relleno + borde, a todo lo ancho
// y alto de la celda (sin huecos, sin esquinas redondeadas).
function dibujarCelda(
  page: PDFPage,
  fontNormal: PDFFont,
  fontBold: PDFFont,
  x: number,
  yTop: number,
  w: number,
  h: number,
  tarjeta: Tarjeta
) {
  const yBot = yTop - h;
  page.drawRectangle({ x, y: yBot, width: w, height: h, color: tarjeta.relleno });
  page.drawRectangle({ x, y: yBot, width: w, height: h, borderColor: C.linea, borderWidth: 0.6 });
  let y = yTop - PAD_V;
  for (const l of tarjeta.lineas) {
    y -= l.size + 2.5;
    const f = l.negrita ? fontBold : fontNormal;
    page.drawText(l.texto, { x: x + PAD_H, y, size: l.size, font: f, color: l.color });
  }
}

const NOMBRES_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function fechaGenerado(): string {
  return new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Encabezado con barra resumen (como en las imágenes de referencia)
// ---------------------------------------------------------------------------

function encabezadoPagina(
  page: PDFPage,
  fontBold: PDFFont,
  fontNormal: PDFFont,
  titulo: string,
  subtitulo: string,
  resumenItems: { etiqueta: string; valor: string; color: Color }[]
) {
  page.drawText(titulo, { x: MARGEN, y: PAGE_H - 30, size: 14, font: fontBold, color: C.titulo });
  page.drawText(subtitulo, { x: MARGEN, y: PAGE_H - 45, size: 9, font: fontNormal, color: C.subtitulo });

  // barra de resumen tipo "chip"
  let x = MARGEN;
  const yChip = PAGE_H - 70;
  for (const item of resumenItems) {
    page.drawCircle({ x: x + 4, y: yChip + 4, size: 4, color: item.color });
    const texto = `${item.etiqueta}: ${item.valor}`;
    page.drawText(texto, { x: x + 12, y: yChip, size: 8.5, font: fontNormal, color: C.subtitulo });
    x += 12 + fontNormal.widthOfTextAtSize(texto, 8.5) + 22;
  }

  const yLinea = PAGE_H - 84;
  page.drawLine({ start: { x: MARGEN, y: yLinea }, end: { x: PAGE_W - MARGEN, y: yLinea }, thickness: 0.8, color: C.linea });
}

function piePagina(page: PDFPage, fontNormal: PDFFont, texto: string) {
  page.drawText(texto, { x: MARGEN, y: 20, size: 8, font: fontNormal, color: C.libre });
}

function dibujarLeyenda(page: PDFPage, fontNormal: PDFFont, y: number) {
  const leyenda = [
    { texto: "Clase", color: C.clase.relleno },
    { texto: "Recreo", color: C.recreo.relleno },
    { texto: "Día de deportes", color: C.deporte.relleno },
    { texto: "Reunión", color: C.reunion.relleno },
    { texto: "Colaborativa", color: C.colaborativa.relleno },
  ];
  let lx = MARGEN;
  for (const l of leyenda) {
    const w = fontNormal.widthOfTextAtSize(l.texto, 7);
    page.drawRectangle({ x: lx, y, width: 8, height: 8, color: l.color });
    page.drawRectangle({ x: lx, y, width: 8, height: 8, borderColor: C.linea, borderWidth: 0.4 });
    page.drawText(l.texto, { x: lx + 11, y: y + 1, size: 7, font: fontNormal, color: C.subtitulo });
    lx += 11 + w + 14;
  }
}

// ---------------------------------------------------------------------------
// Layout principal: columnas independientes por día, Lun-Jue vs. Viernes
// ---------------------------------------------------------------------------

interface ColumnaDia {
  diaId: number;
  nombre: string;
  tarjetas: Tarjeta[];
}

const ALTURA_ENCABEZADO_TABLA = 22;
const GROSOR_DIVISOR_VIERNES = 1.6; // borde grueso entre el bloque regular y viernes

function dibujarGrilla(
  page: PDFPage,
  fontNormal: PDFFont,
  fontBold: PDFFont,
  columnas: ColumnaDia[],
  yTop: number,
  yMin: number
) {
  const viernesIdx = columnas.findIndex((c) => c.nombre === "Viernes");
  const tieneViernes = viernesIdx >= 0;
  const nRegulares = tieneViernes ? columnas.length - 1 : columnas.length;

  const anchoTotal = PAGE_W - MARGEN * 2;
  // Viernes suele tener menos períodos (jornada especial); le damos un
  // ancho algo mayor por columna que a los días regulares para que su
  // contenido no se vea forzado, pero sigue siendo una sola columna.
  const anchoViernes = tieneViernes ? anchoTotal / (nRegulares + 1.15) * 1.15 : 0;
  const anchoDisponibleRegular = anchoTotal - anchoViernes;
  const anchoColRegular = anchoDisponibleRegular / nRegulares;

  const xInicioViernes = MARGEN + anchoDisponibleRegular;

  const regulares = columnas.filter((_, i) => !(tieneViernes && i === viernesIdx));

  // --- Encabezados de la tabla (fila superior con el nombre de cada día) ---
  let xEnc = MARGEN;
  for (const col of regulares) {
    page.drawRectangle({ x: xEnc, y: yTop - ALTURA_ENCABEZADO_TABLA, width: anchoColRegular, height: ALTURA_ENCABEZADO_TABLA, color: rgb(0.955, 0.96, 0.98) });
    page.drawRectangle({ x: xEnc, y: yTop - ALTURA_ENCABEZADO_TABLA, width: anchoColRegular, height: ALTURA_ENCABEZADO_TABLA, borderColor: C.linea, borderWidth: 0.6 });
    const tw = fontBold.widthOfTextAtSize(col.nombre, 10.5);
    page.drawText(col.nombre, { x: xEnc + (anchoColRegular - tw) / 2, y: yTop - ALTURA_ENCABEZADO_TABLA + 7, size: 10.5, font: fontBold, color: C.encabezadoDia });
    xEnc += anchoColRegular;
  }
  if (tieneViernes) {
    const colV = columnas[viernesIdx];
    page.drawRectangle({ x: xInicioViernes, y: yTop - ALTURA_ENCABEZADO_TABLA, width: anchoViernes, height: ALTURA_ENCABEZADO_TABLA, color: C.colaborativa.relleno });
    page.drawRectangle({ x: xInicioViernes, y: yTop - ALTURA_ENCABEZADO_TABLA, width: anchoViernes, height: ALTURA_ENCABEZADO_TABLA, borderColor: C.linea, borderWidth: 0.6 });
    const tw = fontBold.widthOfTextAtSize(colV.nombre, 10.5);
    page.drawText(colV.nombre, { x: xInicioViernes + (anchoViernes - tw) / 2, y: yTop - ALTURA_ENCABEZADO_TABLA + 7, size: 10.5, font: fontBold, color: C.colaborativa.texto });
  }

  const yTablaTop = yTop - ALTURA_ENCABEZADO_TABLA;

  // --- Cuerpo: Lun-Jue comparten la misma malla de períodos, así que se
  // alinean por FILA (altura = máximo necesario entre las 4 columnas para
  // ese período). Viernes, con jornada distinta, es una sub-tabla aparte
  // con su propio conteo de filas, arrancando a la misma altura.
  const preparadasRegulares = regulares.map((col) => col.tarjetas.map((t) => prepararTarjeta(fontNormal, fontBold, t, anchoColRegular - PAD_H * 2)));
  const nFilas = preparadasRegulares.reduce((m, arr) => Math.max(m, arr.length), 0);

  let yFila = yTablaTop;
  let yFinRegular = yTablaTop;
  for (let r = 0; r < nFilas; r++) {
    let alturaFila = 0;
    for (const arr of preparadasRegulares) {
      if (arr[r]) alturaFila = Math.max(alturaFila, altoTarjeta(arr[r]));
    }
    if (alturaFila === 0) continue;
    if (yFila - alturaFila < yMin) break;

    let x = MARGEN;
    for (let ci = 0; ci < regulares.length; ci++) {
      const t = preparadasRegulares[ci][r];
      if (t) {
        dibujarCelda(page, fontNormal, fontBold, x, yFila, anchoColRegular, alturaFila, t);
      } else {
        page.drawRectangle({ x, y: yFila - alturaFila, width: anchoColRegular, height: alturaFila, borderColor: C.linea, borderWidth: 0.6 });
      }
      x += anchoColRegular;
    }
    yFila -= alturaFila;
    yFinRegular = yFila;
  }

  // --- Viernes: sub-tabla independiente ---
  let yFinViernes = yTablaTop;
  if (tieneViernes) {
    const colViernes = columnas[viernesIdx];
    const preparadasV = colViernes.tarjetas.map((t) => prepararTarjeta(fontNormal, fontBold, t, anchoViernes - PAD_H * 2));
    let yV = yTablaTop;
    for (const t of preparadasV) {
      const h = altoTarjeta(t);
      if (yV - h < yMin) break;
      dibujarCelda(page, fontNormal, fontBold, xInicioViernes, yV, anchoViernes, h, t);
      yV -= h;
    }
    yFinViernes = yV;
  }

  // Borde exterior grueso de toda la tabla + separador reforzado antes de Viernes
  const yFinTabla = Math.min(yFinRegular, yFinViernes);
  page.drawRectangle({
    x: MARGEN,
    y: yFinTabla,
    width: anchoTotal,
    height: yTop - yFinTabla,
    borderColor: C.titulo,
    borderWidth: 1,
  });
  if (tieneViernes) {
    page.drawLine({
      start: { x: xInicioViernes, y: yTop },
      end: { x: xInicioViernes, y: yFinTabla },
      thickness: GROSOR_DIVISOR_VIERNES,
      color: C.divisorPunteado,
    });
  }
}

// ---------------------------------------------------------------------------
// Construcción de datos por día (curso y profesor)
// ---------------------------------------------------------------------------

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

function bloquesUnicosDocente(
  params: Pick<PdfParams, "asignaciones" | "bloques">,
  profesorId: number,
  seccionBaseId: number
): Map<number, BloqueT[]> {
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

// convierte una lista ordenada de bloques + un resolver en tarjetas, fusionando
// bloques consecutivos idénticos (p.ej. "Día de deportes" en dos periodos seguidos)
function tarjetasDeDia(bloques: BloqueT[], resolver: (b: BloqueT) => Tarjeta): Tarjeta[] {
  const tarjetas: Tarjeta[] = [];
  for (const b of bloques) {
    tarjetas.push(resolver(b));
  }
  return tarjetas;
}

function contarPeriodos(mBloques: Map<number, BloqueT[]>, diasRegulares: number[], diasViernes: number[]) {
  const contar = (dias: number[]) => dias.reduce((s, d) => s + (mBloques.get(d)?.length ?? 0), 0) / Math.max(dias.length, 1);
  return {
    regular: Math.round(contar(diasRegulares)),
    viernes: Math.round(contar(diasViernes)),
  };
}

// ---------------------------------------------------------------------------
// Página por curso
// ---------------------------------------------------------------------------

function paginaCurso(
  doc: PDFDocument,
  fontNormal: PDFFont,
  fontBold: PDFFont,
  seccionNombre: string,
  curso: Prisma.CursoGetPayload<{}>,
  mBloques: Map<number, BloqueT[]>,
  clasePorBloque: Map<string, AsignacionCompleta[]>,
  deportes: Prisma.DeporteSeccionGetPayload<{}>[],
  dias: { id: number; numeroDia: number }[],
  nPagina: number,
  total: number
) {
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const resolver = (dia: number, b: BloqueT): Tarjeta => {
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
      return { lineas, relleno: C.clase.relleno, textoColor: C.clase.texto };
    }
    const esDeporte = deportes.some((d) => d.seccionId === curso.seccionId && d.diaSemanaId === dia && d.numeroPeriodo === b.numeroPeriodo);
    if (esDeporte) {
      return {
        relleno: C.deporte.relleno,
        textoColor: C.deporte.texto,
        lineas: [
          { texto: "Día de deportes", size: 9, negrita: true, color: C.deporte.texto },
          { texto: `${b.horaInicio}-${b.horaFin} · Bloque reservado`, size: 7, negrita: false, color: C.deporte.texto },
        ],
      };
    }
    if (!b.esAcademico) {
      const esHomeroom = b.numeroPeriodo?.toString().toUpperCase().includes("HOMEROOM");
      const paleta = esHomeroom ? C.homeroom : C.recreo;
      return {
        relleno: paleta.relleno,
        textoColor: paleta.texto,
        esHomeroom,
        lineas: [
          { texto: esHomeroom ? "HOMEROOM" : "BREAK", size: 9, negrita: true, color: paleta.texto },
          { texto: `${b.horaInicio}-${b.horaFin} · Recreo`, size: 7, negrita: false, color: paleta.texto },
        ],
      };
    }
    return {
      relleno: rgb(0.97, 0.97, 0.98),
      textoColor: C.libre,
      lineas: [{ texto: `Libre · ${b.horaInicio}-${b.horaFin}`, size: 7.5, negrita: false, color: C.libre }],
    };
  };

  const idsDias = dias.map((d) => d.id).sort((a, b) => a - b);
  const columnas: ColumnaDia[] = idsDias.map((diaId, i) => ({
    diaId,
    nombre: NOMBRES_DIAS[i] ?? `Día ${i + 1}`,
    tarjetas: tarjetasDeDia(mBloques.get(diaId) ?? [], (b) => resolver(diaId, b)),
  }));

  const diasRegulares = idsDias.slice(0, 4);
  const diasViernes = idsDias.slice(4);
  const { regular, viernes } = contarPeriodos(mBloques, diasRegulares, diasViernes);

  const resumen = [
    { etiqueta: "Lun–Jue", valor: `${regular} períodos`, color: C.clase.relleno },
    { etiqueta: "Viernes (especial)", valor: `${viernes} períodos`, color: C.colaborativa.relleno },
  ];

  encabezadoPagina(
    page,
    fontBold,
    fontNormal,
    `Horario · Curso ${curso.nombre}`,
    `Sección: ${seccionNombre} · Generado: ${fechaGenerado()}`,
    resumen
  );
  dibujarGrilla(page, fontNormal, fontBold, columnas, TOP_COLUMNAS, Y_MIN);
  dibujarLeyenda(page, fontNormal, 26);
  piePagina(page, fontNormal, `Página ${nPagina} de ${total} · Curso ${curso.nombre}`);
}

// ---------------------------------------------------------------------------
// Página por profesor
// ---------------------------------------------------------------------------

function paginaProfesor(
  doc: PDFDocument,
  fontNormal: PDFFont,
  fontBold: PDFFont,
  profesor: ProfesorCompleto,
  mBloques: Map<number, BloqueT[]>,
  clasesProfesor: AsignacionCompleta[],
  reuniones: ReunionCompleta[],
  colaborativas: PdfParams["colaborativas"],
  dias: { id: number; numeroDia: number }[],
  nPagina: number,
  total: number
) {
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const resolver = (dia: number, b: BloqueT): Tarjeta => {
    const reu = reuniones.find(
      (r) =>
        r.secciones.some((s) => s.id === profesor.seccionBaseId) &&
        r.diaSemanaId === dia &&
        solapa(b.horaInicio, b.horaFin, r.horaInicio, r.horaFin)
    );
    if (reu) {
      return {
        relleno: C.reunion.relleno,
        textoColor: C.reunion.texto,
        lineas: [
          { texto: "Reunión de sección", size: 9, negrita: true, color: C.reunion.texto },
          { texto: `${reu.horaInicio}-${reu.horaFin}`, size: 7, negrita: false, color: C.reunion.texto },
        ],
      };
    }
    const col = colaborativas.find(
      (co) =>
        co.departamentoId === profesor.departamentoId &&
        co.diaSemanaId === dia &&
        solapa(b.horaInicio, b.horaFin, co.horaInicio, co.horaFin)
    );
    if (col) {
      return {
        relleno: C.colaborativa.relleno,
        textoColor: C.colaborativa.texto,
        lineas: [
          { texto: `Colaborativa · ${col.departamento.nombre}`, size: 9, negrita: true, color: C.colaborativa.texto },
          { texto: `${col.horaInicio}-${col.horaFin}`, size: 7, negrita: false, color: C.colaborativa.texto },
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
      return { lineas, relleno: C.clase.relleno, textoColor: C.clase.texto };
    }
    if (!b.esAcademico) {
      return {
        relleno: C.recreo.relleno,
        textoColor: C.recreo.texto,
        lineas: [
          { texto: "BREAK", size: 9, negrita: true, color: C.recreo.texto },
          { texto: `${b.horaInicio}-${b.horaFin} · Recreo`, size: 7, negrita: false, color: C.recreo.texto },
        ],
      };
    }
    return {
      relleno: rgb(0.97, 0.97, 0.98),
      textoColor: C.libre,
      lineas: [{ texto: `Libre · ${b.horaInicio}-${b.horaFin}`, size: 7.5, negrita: false, color: C.libre }],
    };
  };

  const idsDias = dias.map((d) => d.id).sort((a, b) => a - b);
  const columnas: ColumnaDia[] = idsDias.map((diaId, i) => ({
    diaId,
    nombre: NOMBRES_DIAS[i] ?? `Día ${i + 1}`,
    tarjetas: tarjetasDeDia(mBloques.get(diaId) ?? [], (b) => resolver(diaId, b)),
  }));

  const diasRegulares = idsDias.slice(0, 4);
  const diasViernes = idsDias.slice(4);
  const { regular, viernes } = contarPeriodos(mBloques, diasRegulares, diasViernes);
  const nReuniones = reuniones.filter((r) => r.secciones.some((s) => s.id === profesor.seccionBaseId)).length;
  const nColaborativas = colaborativas.filter((c) => c.departamentoId === profesor.departamentoId).length;

  const resumen = [
    { etiqueta: "Lun–Jue", valor: `${regular} períodos`, color: C.clase.relleno },
    { etiqueta: "Viernes (especial)", valor: `${viernes} períodos`, color: C.colaborativa.relleno },
    { etiqueta: "Reuniones de sección", valor: `${nReuniones}`, color: C.reunion.relleno },
    { etiqueta: "Colaborativas", valor: `${nColaborativas}`, color: C.colaborativa.relleno },
  ];

  encabezadoPagina(
    page,
    fontBold,
    fontNormal,
    `Horario · Docente ${profesor.nombre}`,
    `Sección base: ${profesor.seccionBase.nombre} · Generado: ${fechaGenerado()}`,
    resumen
  );
  dibujarGrilla(page, fontNormal, fontBold, columnas, TOP_COLUMNAS, Y_MIN);
  dibujarLeyenda(page, fontNormal, 26);
  piePagina(page, fontNormal, `Página ${nPagina} de ${total} · Docente ${profesor.nombre}`);
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

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
    for (const arr of clasePorBloque.values())
      arr.sort((a, b) => a.cargaAcademica.materia.nombre.localeCompare(b.cargaAcademica.materia.nombre, "es"));
    const mBloques = bloquesPorDia(params.bloques, curso.seccionId);
    paginaCurso(doc, fontNormal, fontBold, params.seccion.nombre, curso, mBloques, clasePorBloque, params.deportes, params.dias, nPagina, totalPaginas);
  }

  for (const profesor of profesores) {
    nPagina += 1;
    const mBloques = bloquesUnicosDocente(params, profesor.id, profesor.seccionBaseId);
    const clasesProfesor = params.asignaciones.filter((a) => a.cargaAcademica.profesor.id === profesor.id);
    paginaProfesor(
      doc,
      fontNormal,
      fontBold,
      profesor,
      mBloques,
      clasesProfesor,
      params.reuniones,
      params.colaborativas,
      params.dias,
      nPagina,
      totalPaginas
    );
  }

  return doc.save();
}

export function nombreArchivoSeccion(nombre: string): string {
  return `horario-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}