import { z } from 'zod';
import { redondear } from './calculos';
import { enlaceWhatsapp, formatoCentavos, sinTildes } from './formato';

// Todos los montos de los fiados van en centavos enteros: sumar pesos con decimales acumula error.

const texto = z.string().trim();
const centavos = z.int().min(0);
const dia = z.iso.date();

export const MEDIOS = [
  ['efectivo', 'Efectivo'],
  ['transferencia', 'Transferencia'],
  ['tarjeta', 'Tarjeta'],
  ['otro', 'Otro'],
] as const;
export type Medio = (typeof MEDIOS)[number][0];

export const itemSchema = z.object({
  /** Código del proveedor; '' en un ítem cargado a mano. */
  codigo: texto,
  detalle: texto.min(1, 'Ingresá qué se lleva'),
  cantidad: z.int('Tiene que ser un número entero').min(1, 'Mínimo 1').max(9999, 'Revisá la cantidad'),
  /** Unitario con IVA, congelado al fiar: si la lista sube, la deuda no cambia. */
  precio: centavos.min(1, 'Tiene que ser mayor a $ 0'),
  /** Unitario que pagó el local; null si no se sabe (ítem a mano). */
  costo: centavos.nullable(),
});

export const clienteSchema = z.object({
  id: z.string().min(1),
  nombre: texto.min(1, 'Ingresá el nombre'),
  telefono: texto,
  dni: texto,
  direccion: texto,
  referencia: texto,
  nota: texto,
  limite: centavos.nullable(),
  noFiar: z.boolean(),
  archivado: z.boolean(),
  creado: z.iso.datetime(),
});

const base = {
  id: z.string().min(1),
  clienteId: z.string().min(1),
  /** Día en que pasó (puede ser anterior a cuando se cargó). */
  fecha: dia,
  registrado: z.iso.datetime(),
  nota: texto,
  vendedor: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  /** Nunca se borra un movimiento: se anula y queda a la vista. */
  anulado: z.object({ fecha: z.iso.datetime(), motivo: texto.min(1) }).nullable(),
};

export const movimientoSchema = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('cargo'), items: z.array(itemSchema).min(1) }),
  z.object({ ...base, tipo: z.literal('pago'), monto: centavos.min(1), medio: z.enum(MEDIOS.map(([m]) => m) as [Medio, ...Medio[]]) }),
  // Positivo suma a la deuda (actualización), negativo descuenta (descuento, incobrable).
  z.object({ ...base, tipo: z.literal('ajuste'), monto: z.int().refine((n) => n !== 0, 'No puede ser 0') }),
]);

export type Item = z.infer<typeof itemSchema>;
export type Cliente = z.infer<typeof clienteSchema>;
export type Movimiento = z.infer<typeof movimientoSchema>;
export type Cargo = Extract<Movimiento, { tipo: 'cargo' }>;

export interface Fiados {
  clientes: Cliente[];
  movimientos: Movimiento[];
}

export const FIADOS_VACIO: Fiados = { clientes: [], movimientos: [] };

/** Valida todo junto (para importar un backup): un solo dato malo invalida el archivo. */
export const fiadosSchema = z.object({ clientes: z.array(clienteSchema), movimientos: z.array(movimientoSchema) }).superRefine((f, ctx) => {
  // Al cargar, un movimiento sin cliente se deja afuera; al importar se rechaza el archivo entero.
  const ids = new Set(f.clientes.map((c) => c.id));
  f.movimientos.forEach((m, i) => {
    if (!ids.has(m.clienteId)) ctx.addIssue({ code: 'custom', path: ['movimientos', i, 'clienteId'], message: 'Movimiento de un cliente que no está en el archivo' });
  });
});

export const aCentavos = (pesos: number) => redondear(pesos * 100);

const dos = (n: number) => String(n).padStart(2, '0');
/** AAAA-MM-DD en hora local. */
export const diaDe = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
export const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
export const formatoDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export const totalItems = (items: readonly Item[]) => items.reduce((a, i) => a + i.precio * i.cantidad, 0);

/** Lo que el movimiento mueve la deuda: positivo la sube, negativo la baja. */
export const importe = (m: Movimiento) => (m.tipo === 'cargo' ? totalItems(m.items) : m.tipo === 'pago' ? -m.monto : m.monto);

const cronologico = (a: Movimiento, b: Movimiento) => a.fecha.localeCompare(b.fecha) || a.registrado.localeCompare(b.registrado);

export interface Pendiente {
  id: string;
  fecha: string;
  pendiente: number;
}

export interface Cuenta {
  /** Positivo: debe. Negativo: tiene a favor. */
  saldo: number;
  /** Cargos que todavía no se terminaron de pagar, del más viejo al más nuevo. */
  pendientes: Pendiente[];
  /** Días desde el cargo impago más viejo; null si no debe nada. */
  antiguedad: number | null;
  ultimoPago: string | null;
  fiado: number;
  /** Ganancia de los ítems con costo conocido. */
  ganancia: number;
}

/** Estado de la cuenta de un cliente con sus movimientos. Los anulados no cuentan. */
export function cuenta(movimientos: readonly Movimiento[], hoy: string): Cuenta {
  const activos = movimientos.filter((m) => !m.anulado).sort(cronologico);
  const deudas: Pendiente[] = activos
    .filter((m) => importe(m) > 0)
    .map((m) => ({ id: m.id, fecha: m.fecha, pendiente: importe(m) }));
  let credito = activos.reduce((a, m) => a + Math.max(0, -importe(m)), 0);
  // Lo que paga cancela primero lo más viejo, aunque haya pagado antes de que se cargara.
  for (const d of deudas) {
    const x = Math.min(d.pendiente, credito);
    d.pendiente -= x;
    credito -= x;
  }
  const pendientes = deudas.filter((d) => d.pendiente > 0);
  const cargos = activos.filter((m): m is Cargo => m.tipo === 'cargo');
  return {
    saldo: activos.reduce((a, m) => a + importe(m), 0),
    pendientes,
    antiguedad: pendientes[0] ? Math.max(0, diasEntre(pendientes[0].fecha, hoy)) : null,
    ultimoPago: activos.findLast((m) => m.tipo === 'pago')?.fecha ?? null,
    fiado: cargos.reduce((a, m) => a + totalItems(m.items), 0),
    ganancia: cargos.reduce((a, m) => a + m.items.reduce((b, i) => b + (i.costo === null ? 0 : (i.precio - i.costo) * i.cantidad), 0), 0),
  };
}

/** Movimientos agrupados por cliente. */
export function porCliente(movimientos: readonly Movimiento[]): Map<string, Movimiento[]> {
  const m = new Map<string, Movimiento[]>();
  for (const x of movimientos) {
    const lista = m.get(x.clienteId);
    if (lista) lista.push(x);
    else m.set(x.clienteId, [x]);
  }
  return m;
}

export interface Resumen {
  cuentas: Map<string, Cuenta>;
  aCobrar: number;
  aFavor: number;
  deudores: number;
  cobradoMes: number;
}

export function resumen(f: Fiados, hoy: string): Resumen {
  const grupos = porCliente(f.movimientos);
  const cuentas = new Map(f.clientes.map((c) => [c.id, cuenta(grupos.get(c.id) ?? [], hoy)] as const));
  const lista = [...cuentas.values()];
  const mes = hoy.slice(0, 7);
  return {
    cuentas,
    aCobrar: lista.reduce((a, c) => a + Math.max(0, c.saldo), 0),
    aFavor: lista.reduce((a, c) => a + Math.max(0, -c.saldo), 0),
    deudores: lista.filter((c) => c.saldo > 0).length,
    cobradoMes: f.movimientos.reduce((a, m) => a + (m.tipo === 'pago' && !m.anulado && m.fecha.startsWith(mes) ? m.monto : 0), 0),
  };
}

/** Saldo después de cada movimiento activo, en orden cronológico. */
export function saldosCorridos(movimientos: readonly Movimiento[]): Map<string, number> {
  let saldo = 0;
  return new Map(
    movimientos
      .filter((m) => !m.anulado)
      .sort(cronologico)
      .map((m) => [m.id, (saldo += importe(m))] as const),
  );
}

/**
 * Saldos para el recibo de un pago. `saldo` es el actual (al día de hoy), no el corrido a la fecha
 * del pago: un pago con fecha anterior a otros fiados dejaría un "pendiente" falso. `anterior` sólo
 * se da si después del pago no se registró ni anuló nada, porque si no saldo + monto ya no es lo
 * que debía justo antes de pagar.
 */
export function saldosRecibo(movimientos: readonly Movimiento[], pago: Extract<Movimiento, { tipo: 'pago' }>): { anterior: number | null; saldo: number } {
  const saldo = movimientos.reduce((a, m) => a + (m.anulado ? 0 : importe(m)), 0);
  const posterior = movimientos.some((m) => m.id !== pago.id && (m.registrado > pago.registrado || (m.anulado !== null && m.anulado.fecha > pago.registrado)));
  return { anterior: posterior ? null : saldo + pago.monto, saldo };
}

// Se reconoce por el motivo: "Dar por incobrable" siempre lo deja con esa palabra.
const esIncobrable = (m: Movimiento) => m.tipo === 'ajuste' && !m.anulado && /incobrable/i.test(m.nota);

/** Lo dado por incobrable que todavía no se recuperó con un "Recupero de incobrable". */
export const incobrablePendiente = (movimientos: readonly Movimiento[]) => Math.max(0, -movimientos.filter(esIncobrable).reduce((a, m) => a + importe(m), 0));

/** Fiado fuera de lo normal para el cliente: más de 3 veces su fiado más grande, o más de $ 1.000.000 si nunca fió. */
export function fiadoInusual(movimientos: readonly Movimiento[], total: number): boolean {
  const mayor = movimientos.reduce((a, m) => (m.tipo === 'cargo' && !m.anulado ? Math.max(a, totalItems(m.items)) : a), 0);
  return total > (mayor > 0 ? mayor * 3 : 1_000_000_00);
}

const digitos = (t: string) => t.replace(/\D/g, '');

/** Clientes que parecen la misma persona: mismo nombre, mismo DNI o mismo teléfono. */
export function parecidos(clientes: readonly Cliente[], c: Pick<Cliente, 'id' | 'nombre' | 'telefono' | 'dni'>): Cliente[] {
  const nombre = sinTildes(c.nombre);
  // Últimos 6 dígitos: así coincide con o sin 0, 15 o característica.
  const tel = digitos(c.telefono).slice(-6);
  const dni = digitos(c.dni);
  return clientes.filter(
    (x) =>
      x.id !== c.id &&
      ((nombre !== '' && sinTildes(x.nombre) === nombre) || (tel.length === 6 && digitos(x.telefono).slice(-6) === tel) || (dni.length >= 7 && digitos(x.dni) === dni)),
  );
}

/** Pasa los movimientos de un cliente a otro y saca al primero. Sin efecto si es el mismo o alguno no existe. */
export function unir(f: Fiados, desde: string, hacia: string): Fiados {
  const existe = (id: string) => f.clientes.some((c) => c.id === id);
  if (desde === hacia || !existe(desde) || !existe(hacia)) return f;
  return {
    clientes: f.clientes.filter((c) => c.id !== desde),
    movimientos: f.movimientos.map((m) => (m.clienteId === desde ? { ...m, clienteId: hacia } : m)),
  };
}

/** Ítems que quedan después de devolver `devueltos[i]` unidades del ítem i. */
export const quitarDevueltos = (items: readonly Item[], devueltos: readonly number[]): Item[] =>
  items.map((i, n) => ({ ...i, cantidad: i.cantidad - Math.min(i.cantidad, devueltos[n] ?? 0) })).filter((i) => i.cantidad > 0);

/** Suma un ítem a la lista; si ya está el mismo código al mismo precio, suma la cantidad. */
export function sumarItem(items: readonly Item[], nuevo: Item): Item[] {
  // El código es de cada proveedor: dos artículos distintos pueden tener el mismo código y precio.
  const i = nuevo.codigo ? items.findIndex((x) => x.codigo === nuevo.codigo && x.detalle === nuevo.detalle && x.precio === nuevo.precio) : -1;
  if (i === -1) return [...items, nuevo];
  return items.map((x, n) => (n === i ? { ...x, cantidad: Math.min(9999, x.cantidad + nuevo.cantidad) } : x));
}

export const descripcionItems = (items: readonly Item[]) => items.map((i) => (i.cantidad === 1 ? i.detalle : `${i.detalle} ×${i.cantidad}`)).join(', ');

/** Texto para mandar por WhatsApp con el estado de la cuenta. */
export function mensajeDeuda(local: string, c: Cliente, k: Cuenta): string {
  const nombre = c.nombre.split(' ')[0] ?? c.nombre;
  if (k.saldo <= 0) return `Hola ${nombre}, te escribimos de ${local}. Tu cuenta está al día${k.saldo < 0 ? ` y tenés ${formatoCentavos(-k.saldo)} a favor` : ''}. ¡Gracias!`;
  const pago = k.ultimoPago ? ` Tu último pago fue el ${formatoDia(k.ultimoPago)}.` : '';
  return `Hola ${nombre}, te escribimos de ${local}. Te recordamos que tenés un saldo de ${formatoCentavos(k.saldo)} en tu cuenta.${pago} Cualquier consulta, escribinos. ¡Gracias!`;
}

/** wa.me con el texto cargado, o null si el teléfono no sirve para WhatsApp. */
export function enlaceMensaje(telefono: string, mensaje: string): string | null {
  const url = enlaceWhatsapp(telefono);
  return url && `${url}?text=${encodeURIComponent(mensaje)}`;
}

const celda = (t: string) => (/[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
/** Excel tomaría como fórmula un texto que empieza con = + - @ o tab: se le pone un apóstrofe adelante. */
const textoSeguro = (t: string) => (/^[=+\-@\t\r]/.test(t) ? `'${t}` : t);
const numeroCsv = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** CSV para Excel en castellano: separado por punto y coma, coma decimal y BOM para los acentos. */
export function csvClientes(clientes: readonly Cliente[], cuentas: Map<string, Cuenta>): string {
  const filas = [['Cliente', 'Teléfono', 'DNI', 'Saldo', 'Días de deuda', 'Último pago', 'Límite', 'No fiar']];
  for (const c of clientes) {
    const k = cuentas.get(c.id);
    filas.push([
      textoSeguro(c.nombre),
      // Sin apóstrofe en el teléfono: "+54…" es normal y el apóstrofe quedaría visible.
      c.telefono,
      textoSeguro(c.dni),
      numeroCsv(k?.saldo ?? 0),
      k?.antiguedad == null ? '' : String(k.antiguedad),
      k?.ultimoPago ? formatoDia(k.ultimoPago) : '',
      c.limite === null ? '' : numeroCsv(c.limite),
      c.noFiar ? 'Sí' : '',
    ]);
  }
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}
