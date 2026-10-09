import { sinTildes } from './formato';
import type { Registro } from './historial';

export type Periodo = 'dia' | 'semana' | 'mes' | 'trimestre' | 'anio' | 'todo';

/** [desde, hasta): hasta no se incluye. */
export interface Tramo {
  desde: Date;
  hasta: Date;
  etiqueta: string;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const corto = (s: string) => s.slice(0, 3);
const diaMes = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;

/** Período que contiene a `ref`. La semana arranca el lunes; el trimestre es calendario (ene–mar, abr–jun…). null = histórico. */
export function rango(p: Periodo, ref: Date): Tramo | null {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();
  switch (p) {
    case 'dia':
      return { desde: new Date(y, m, d), hasta: new Date(y, m, d + 1), etiqueta: `${DIAS[ref.getDay()]} ${d}/${m + 1}/${y}` };
    case 'semana': {
      const lunes = d - ((ref.getDay() + 6) % 7);
      const desde = new Date(y, m, lunes);
      const domingo = new Date(y, m, lunes + 6);
      return { desde, hasta: new Date(y, m, lunes + 7), etiqueta: `Del ${diaMes(desde)} al ${diaMes(domingo)}/${domingo.getFullYear()}` };
    }
    case 'mes':
      return { desde: new Date(y, m, 1), hasta: new Date(y, m + 1, 1), etiqueta: `${MESES[m]} ${y}` };
    case 'trimestre': {
      const t = m - (m % 3);
      return { desde: new Date(y, t, 1), hasta: new Date(y, t + 3, 1), etiqueta: `${MESES[t]} a ${MESES[t + 2]?.toLowerCase()} ${y}` };
    }
    case 'anio':
      return { desde: new Date(y, 0, 1), hasta: new Date(y + 1, 0, 1), etiqueta: String(y) };
    case 'todo':
      return null;
  }
}

/** Corre `ref` n períodos para atrás (n < 0) o para adelante. */
export function mover(p: Periodo, ref: Date, n: number): Date {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();
  switch (p) {
    case 'dia':
      return new Date(y, m, d + n);
    case 'semana':
      return new Date(y, m, d + 7 * n);
    case 'mes':
      return new Date(y, m + n, 1);
    case 'trimestre':
      return new Date(y, m + 3 * n, 1);
    case 'anio':
      return new Date(y + n, 0, 1);
    case 'todo':
      return ref;
  }
}

export const enTramo = (r: Registro, t: Tramo | null) => {
  if (!t) return true;
  const f = new Date(r.fecha);
  return f >= t.desde && f < t.hasta;
};

/** Barras del gráfico: días de la semana o del mes, semanas del trimestre, meses del año; el histórico por mes (o por año si pasan de 24 meses). */
export function tramos(p: Periodo, ref: Date, primero: Date | null, hoy: Date): Tramo[] {
  const r = rango(p, ref);
  const out: Tramo[] = [];
  if (p === 'dia') return out;
  if (p === 'semana' || p === 'mes') {
    for (let d = r!.desde; d < r!.hasta; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      out.push({ desde: d, hasta: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), etiqueta: p === 'semana' ? corto(DIAS[d.getDay()]!) : String(d.getDate()) });
    }
  } else if (p === 'trimestre') {
    const inicio = rango('semana', r!.desde)!.desde;
    for (let d = inicio; d < r!.hasta; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      out.push({ desde: d, hasta: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7), etiqueta: diaMes(d) });
    }
  } else if (p === 'anio') {
    for (let m = 0; m < 12; m++) out.push({ desde: new Date(ref.getFullYear(), m, 1), hasta: new Date(ref.getFullYear(), m + 1, 1), etiqueta: corto(MESES[m]!) });
  } else {
    const desde = primero ?? hoy;
    const meses = (hoy.getFullYear() - desde.getFullYear()) * 12 + hoy.getMonth() - desde.getMonth() + 1;
    if (meses <= 24) {
      for (let i = 0; i < meses; i++) {
        const d = new Date(desde.getFullYear(), desde.getMonth() + i, 1);
        out.push({ desde: d, hasta: new Date(d.getFullYear(), d.getMonth() + 1, 1), etiqueta: `${corto(MESES[d.getMonth()]!)} ${String(d.getFullYear()).slice(2)}` });
      }
    } else {
      for (let y = desde.getFullYear(); y <= hoy.getFullYear(); y++) out.push({ desde: new Date(y, 0, 1), hasta: new Date(y + 1, 0, 1), etiqueta: String(y) });
    }
  }
  return out;
}

/** Misma persona aunque cambien mayúsculas, tildes o espacios. */
const claveCliente = sinTildes;

export interface Metricas {
  presupuestos: number;
  motos: number;
  clientes: number;
  /** Suma de los precios de lista presupuestados. */
  monto: number;
  promedioMoto: number;
  porVendedor: { nombre: string; presupuestos: number; motos: number; monto: number }[];
  topMotos: { nombre: string; veces: number }[];
  clientesRepetidos: number;
}

export function metricas(registros: readonly Registro[]): Metricas {
  const vendedores = new Map<string, Metricas['porVendedor'][number]>();
  const modelos = new Map<string, number>();
  const clientes = new Map<string, number>();
  let motos = 0;
  let monto = 0;
  for (const r of registros) {
    const montoR = r.motos.reduce((a, m) => a + m.precioLista, 0);
    motos += r.motos.length;
    monto += montoR;
    const nombreV = r.vendedor?.nombre ?? 'Sin vendedor';
    const v = vendedores.get(nombreV) ?? { nombre: nombreV, presupuestos: 0, motos: 0, monto: 0 };
    v.presupuestos++;
    v.motos += r.motos.length;
    v.monto += montoR;
    vendedores.set(nombreV, v);
    for (const m of r.motos) {
      const n = `${m.marca} ${m.modelo}`.trim();
      modelos.set(n, (modelos.get(n) ?? 0) + 1);
    }
    const c = claveCliente(r.cliente.nombre);
    clientes.set(c, (clientes.get(c) ?? 0) + 1);
  }
  return {
    presupuestos: registros.length,
    motos,
    clientes: clientes.size,
    monto,
    promedioMoto: motos > 0 ? Math.round(monto / motos) : 0,
    porVendedor: [...vendedores.values()].sort((a, b) => b.presupuestos - a.presupuestos || b.monto - a.monto),
    topMotos: [...modelos.entries()]
      .map(([nombre, veces]) => ({ nombre, veces }))
      .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 5),
    clientesRepetidos: [...clientes.values()].filter((n) => n > 1).length,
  };
}
