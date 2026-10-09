import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { z } from 'zod';
import { enTauri } from './entorno';

export const IVA_POR_DEFECTO = 21;

/** Órdenes del catálogo, con el valor que usa el sitio. */
export const ORDENES = [
  [1, 'Por defecto'],
  [2, 'Detalle'],
  [3, 'Código'],
  [4, 'Disponibilidad'],
  [5, 'Menor precio'],
  [6, 'Mayor precio'],
] as const;

export interface Articulo {
  codigo: string;
  detalle: string;
  estado: string;
  /** Semáforo de stock del sitio: 'disponible', 'bajostock'… ('' si no vino). */
  stock: string;
  imagen: string;
  unidad: string;
  empaque: string;
  infoAdicional: string;
  /** Precio de lista sin IVA. */
  lista: number;
  /** Bonificación de la cuenta de Beto, en %. */
  bonif: number;
  /** Página del artículo en el sitio, para abrirla en el navegador (Córdoba Motos la abre por código). */
  url?: string;
  /** Lo que necesita el proveedor para sumarlo a su carrito; sin esto no se puede (por ejemplo, sin stock). */
  carrito?: Record<string, unknown>;
}

export interface Resultado {
  articulos: Articulo[];
  total: number;
  porPagina: number;
  orden: number;
}

/** Error de una página que cambió, con el dato que dejó de venir para saber qué arreglar. */
export const cambio = (sitio: string, e?: z.ZodError) => {
  const campo = e?.issues[0]?.path.join('.');
  return new Error(`${sitio} cambió su página: no se pudieron leer los artículos${campo ? ` (falta o cambió «${campo}»)` : ''}.`);
};

/** Valida cada artículo por separado: uno raro se saltea, pero si no se puede leer ninguno, el sitio cambió. */
export function cadaUno<T>(sitio: string, items: unknown[], schema: z.ZodType<T>): T[] {
  const ok: T[] = [];
  let error: z.ZodError | undefined;
  for (const it of items) {
    const r = schema.safeParse(it);
    if (r.success) ok.push(r.data);
    else error ??= r.error;
  }
  if (error && ok.length === 0) throw cambio(sitio, error);
  return ok;
}

/** JSON de la respuesta de un sitio; si mandó otra cosa (una página de error, el login) lo dice. */
export function leerJson(sitio: string, texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`${sitio} respondió algo que no son datos (puede haber cambiado su página o estar caída).`);
  }
}

/** Número de un precio escrito "4864.99", "4.864,99" o "$ 4,864.99": el último separador seguido de 1 o 2 dígitos es el decimal. */
export function aNumero(s: string): number {
  const t = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return NaN;
  const m = /[.,](\d{1,2})$/.exec(t);
  const entero = (m ? t.slice(0, m.index) : t).replace(/[.,]/g, '');
  return Number(m ? `${entero}.${m[1]}` : entero);
}

// Lo que viene del sitio es externo: se valida antes de mostrar precios.
const productoSchema = z.object({
  ProductoId: z.string(),
  ProductoDetalle: z.string(),
  ProductoEstadoNombre: z.string(),
  ProductoImagenUri: z.string(),
  ProductoPrecio: z.number(),
  UnidadMedidaDetalle: z.string().catch(''),
  ProductoDetalleEmpaque: z.string().catch(''),
  ProductoInfoAdicional: z.string().catch(''),
});
const bonifSchema = z.object({ SDT_BonificacionesBolsa: z.array(z.object({ vArticulo: z.string(), vBon: z.string() })) });
const catalogoSchema = z.object({
  productos: z.array(z.unknown()),
  bonificaciones: z.unknown(),
  total: z.number(),
  porPagina: z.number().positive(),
  orden: z.number(),
  semaforos: z.array(z.string()).catch([]),
});

/** Lo que se le cobra a la cuenta: lista con la bonificación y el IVA sumado. */
export const costoConIva = (lista: number, bonif: number, iva: number) => lista * (1 - bonif / 100) * (1 + iva / 100);

/** Precio de venta: lista con el IVA sumado. */
export const precioConIva = (lista: number, iva: number) => lista * (1 + iva / 100);

/** Arma el resultado con las variables del catálogo que lee la ventana oculta. */
export function leerCatalogo(datos: unknown): Resultado {
  const r = catalogoSchema.safeParse(datos);
  if (!r.success) throw cambio('CM', r.error);
  const b = bonifSchema.safeParse(r.data.bonificaciones);
  const bonifs = new Map(b.success ? b.data.SDT_BonificacionesBolsa.map((x) => [x.vArticulo, Number(x.vBon) || 0] as const) : []);
  return {
    total: r.data.total,
    porPagina: r.data.porPagina,
    orden: r.data.orden,
    // shortcut: ignora los descuentos escalonados por cantidad (vEscalonamientos); sumarlos si Beto compra por volumen.
    articulos: cadaUno(
      'CM',
      // El semáforo va por posición: se empareja antes de saltear artículos ilegibles.
      r.data.productos.map((x, i) => ({ ...(x as object), __fila: i })),
      productoSchema.extend({ __fila: z.number() }),
    ).map(({ __fila: i, ...p }) => ({
      codigo: p.ProductoId.trim(),
      detalle: p.ProductoDetalle.trim(),
      estado: p.ProductoEstadoNombre,
      stock: /([a-z]+)Semaforo\.\w+$/i.exec(r.data.semaforos[i] ?? '')?.[1]?.toLowerCase() ?? '',
      imagen: p.ProductoImagenUri,
      unidad: p.UnidadMedidaDetalle.trim(),
      empaque: p.ProductoDetalleEmpaque.trim(),
      infoAdicional: p.ProductoInfoAdicional.trim(),
      lista: p.ProductoPrecio,
      bonif: bonifs.get(p.ProductoId) ?? 0,
      carrito: {},
    })),
  };
}

/** No hay sesión ni cuenta guardada: hay que entrar a mano. */
export class SinSesion extends Error {}
/** Falló la entrada automática con la cuenta guardada (el mensaje dice por qué). */
export class LoginFallido extends Error {}

export async function llamar<T>(comando: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(comando, args);
  } catch (e) {
    if (e === 'SIN_SESION') throw new SinSesion();
    if (typeof e === 'string' && e.startsWith('LOGIN_FALLIDO:')) throw new LoginFallido(e.slice('LOGIN_FALLIDO:'.length));
    throw new Error(String(e));
  }
}

const catalogo = async (comando: string, args: Record<string, unknown>) => leerCatalogo(JSON.parse(await llamar<string>(comando, args)));

/** Busca por palabras, código o código de barras. Lanza SinSesion si hay que loguearse. */
export const buscarCba = (texto: string) => catalogo('cba_buscar', { texto });

export type Accion = { tipo: 'siguiente' } | { tipo: 'anterior' } | { tipo: 'orden'; valor: number };

/** Suma unidades al carrito de CM con el + de la fila: el artículo tiene que estar en la página de la última búsqueda. */
export const carritoCba = (a: Articulo, cantidad: number) => llamar<void>('cba_carrito', { codigo: a.codigo, cantidad });

/** Pagina u ordena la última búsqueda. */
export const accionCba = (accion: Accion) => catalogo('cba_accion', { accion });

export interface Ficha {
  caracteristicas: [string, string][];
}

/** Saca las características (MARCA, PARTE…) de los datos de la grilla de infoproducto.aspx. */
export function leerFicha(grilla: unknown): Ficha {
  const filas = z.array(z.array(z.unknown())).safeParse(grilla);
  if (!filas.success) throw new Error('CM cambió su página: no se pudo leer la ficha.');
  // Cada fila trae muchas celdas vacías: la primera con texto es el nombre y la segunda el valor.
  const caracteristicas = filas.data
    .map((f) => f.filter((c): c is string => typeof c === 'string' && c.trim() !== '').map((c) => c.trim()))
    .filter((f) => f.length >= 2)
    .map((f) => [f[0]!, f[1]!] as [string, string]);
  return { caracteristicas };
}

export async function fichaCba(codigo: string): Promise<Ficha> {
  const html = await llamar<string>('cba_ficha', { codigo });
  const valor = new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLInputElement>('input[name$="GridproductocaracteristicaContainerDataV"]')?.value;
  return leerFicha(JSON.parse(valor ?? '[]'));
}

/** Avisa cuando se cierra la ventana de login del proveedor. Devuelve la función que deja de escuchar. */
export function alCerrarLogin(proveedor: string, cb: () => void): () => void {
  if (!enTauri) return () => undefined;
  const quitar = listen<string>('sesion-proveedor', (e) => e.payload === proveedor && cb());
  return () => void quitar.then((f) => f());
}

/** Abre el artículo en el sitio, en una ventana de la app con la sesión iniciada. */
export const abrirCba = (codigo: string) => invoke<void>('cba_abrir', { codigo });
