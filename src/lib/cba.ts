import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

/** Proveedores con buscador. El id es la clave del IVA en la configuración. */
export const PROVEEDORES = [{ id: 'cba', nombre: 'Córdoba Motos', sitio: 'cbamotos.com.ar' }] as const;

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
}

export interface Resultado {
  articulos: Articulo[];
  total: number;
  porPagina: number;
  orden: number;
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
  productos: z.array(productoSchema),
  bonificaciones: z.unknown(),
  total: z.number(),
  porPagina: z.number().positive(),
  orden: z.number(),
  semaforos: z.array(z.string()),
});

/** Lo que se le cobra a la cuenta: lista con la bonificación y el IVA sumado. */
export const costoConIva = (lista: number, bonif: number, iva: number) => lista * (1 - bonif / 100) * (1 + iva / 100);

/** Precio de venta: lista con el IVA sumado. */
export const precioConIva = (lista: number, iva: number) => lista * (1 + iva / 100);

/** Arma el resultado con las variables del catálogo que lee la ventana oculta. */
export function leerCatalogo(datos: unknown): Resultado {
  const r = catalogoSchema.safeParse(datos);
  if (!r.success) throw new Error('Córdoba Motos cambió su página: no se pudieron leer los artículos.');
  const b = bonifSchema.safeParse(r.data.bonificaciones);
  const bonifs = new Map(b.success ? b.data.SDT_BonificacionesBolsa.map((x) => [x.vArticulo, Number(x.vBon) || 0] as const) : []);
  return {
    total: r.data.total,
    porPagina: r.data.porPagina,
    orden: r.data.orden,
    // shortcut: ignora los descuentos escalonados por cantidad (vEscalonamientos); sumarlos si Beto compra por volumen.
    articulos: r.data.productos.map((p, i) => ({
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
    })),
  };
}

export class SinSesion extends Error {}

async function llamar<T>(comando: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(comando, args);
  } catch (e) {
    if (e === 'SIN_SESION') throw new SinSesion();
    throw new Error(String(e));
  }
}

const catalogo = async (comando: string, args: Record<string, unknown>) => leerCatalogo(JSON.parse(await llamar<string>(comando, args)));

/** Busca por palabras, código o código de barras. Lanza SinSesion si hay que loguearse. */
export const buscarCba = (texto: string) => catalogo('cba_buscar', { texto });

export type Accion = { tipo: 'siguiente' } | { tipo: 'anterior' } | { tipo: 'orden'; valor: number };

/** Pagina u ordena la última búsqueda. */
export const accionCba = (accion: Accion) => catalogo('cba_accion', { accion });

export interface Ficha {
  caracteristicas: [string, string][];
}

/** Saca las características (MARCA, PARTE…) de los datos de la grilla de infoproducto.aspx. */
export function leerFicha(grilla: unknown): Ficha {
  const filas = z.array(z.array(z.unknown())).safeParse(grilla);
  if (!filas.success) throw new Error('Córdoba Motos cambió su página: no se pudo leer la ficha.');
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

export const loginCba = () => invoke<void>('cba_login');

/** Abre el artículo en el sitio, en una ventana de la app con la sesión iniciada. */
export const abrirCba = (codigo: string) => invoke<void>('cba_abrir', { codigo });
