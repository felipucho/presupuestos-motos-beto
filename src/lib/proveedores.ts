import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { z } from 'zod';
import { abrirCba, accionCba, aNumero, buscarCba, cadaUno, cambio, carritoCba, fichaCba, leerJson, llamar, type Accion, type Articulo, type Ficha, type Resultado } from './cba';

export type IdProveedor = 'cba' | 'neumat' | 'ab' | 'changomax';

export interface Proveedor {
  id: IdProveedor;
  /** Nombre completo: sólo en Configuración. */
  nombre: string;
  /** Como se ve en la pantalla de precios. */
  nombreCorto: string;
  sitio: string;
  /** Abre el login a mano: para cuando no hay cuenta guardada o la entrada automática falla. */
  login: () => Promise<void>;
  buscar: (texto: string) => Promise<Resultado>;
  /** Paginado y orden del sitio, si los tiene. */
  accion?: (a: Accion) => Promise<Resultado>;
  ficha?: (codigo: string) => Promise<Ficha>;
  abrir: (a: Articulo) => Promise<void>;
  /** Suma unidades al carrito de la cuenta en el sitio (no compra: el pedido se confirma en la página). */
  agregarAlCarrito?: (a: Articulo, cantidad: number) => Promise<void>;
}

const NEUMAT = 'https://neumatmotos.com.ar';
const AB = 'https://ventas.fundasparamotosab.com.ar';

const sinEtiquetas = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // Al final: si no, "&amp;lt;" se decodificaría dos veces.
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Primer texto dentro del elemento con esa clase (tolera otras clases, comillas simples y etiquetas en el medio).
 * Saltea lo tachado (<del>, <s>, <strike>): en una oferta ahí va el precio viejo. */
const textoDe = (html: string, clase: string) => {
  const m = new RegExp(
    `class=["'][^"']*\\b${clase}\\b[^"']*["'][^>]*>(?:\\s*(?:<(?:del|s|strike)\\b[^>]*>[\\s\\S]*?</(?:del|s|strike)>|<(?!img)[^>]*>))*\\s*([^<]+)`,
    'i',
  ).exec(html);
  return m?.[1]?.trim() || undefined;
};

/** Arma el resultado con el HTML del listado de Neumat. Sus precios ya son los de la cuenta: sin bonificación aparte. */
export function leerNeumat(html: string): Resultado {
  const sinResultados = /No se encuentran productos/i.test(html);
  if (!/id=["']listArticulos["']/i.test(html) && !sinResultados) throw cambio('PIRELLI');
  const tarjetas = html.split(/class=["'][^"']*\bcolumContainerList\b/i).slice(1);
  const articulos = tarjetas.flatMap((t): Articulo[] => {
    const codigo = /ArticuloID=([\w-]+)/i.exec(t)?.[1];
    const detalle = textoDe(t, 'textTituloProductos');
    const precio = aNumero(textoDe(t, 'textPrecio') ?? '');
    if (!codigo || !detalle || !Number.isFinite(precio)) return [];
    const marca = sinEtiquetas(textoDe(t, 'textLeyenda') ?? '');
    const imagen = /class=["'][^"']*\bimgListadoProducto\b[^"']*["'][^>]*\bsrc=["']([^"']+)/i.exec(t)?.[1] ?? '';
    const estado = /Sin Stock|Ultimas Unidades|Stock/i.exec(sinEtiquetas(t.slice(t.indexOf('columBtnSemaforoList'))))?.[0] ?? '';
    const mas = /id=["']mas_[\w-]+["']([^>]*)>/i.exec(t)?.[1];
    const dato = (n: string) => new RegExp(`data-${n}=["']([^"']*)["']`, 'i').exec(mas ?? '')?.[1] ?? '';
    const enCarrito = aNumero(/class=["'][^"']*\bparrafoCantidad\b[^"']*["'][^>]*>([^<]*)</i.exec(t)?.[1] ?? '0');
    return [
      {
        codigo,
        detalle: sinEtiquetas(detalle),
        estado: estado || 'Sin dato',
        stock: estado === 'Stock' ? 'disponible' : estado === 'Ultimas Unidades' ? 'bajostock' : '',
        imagen: imagen && new URL(imagen, NEUMAT).href,
        unidad: '',
        empaque: '',
        infoAdicional: marca && `Marca: ${marca}`,
        lista: precio,
        bonif: 0,
        url: `${NEUMAT}/DetalleProducto?ArticuloID=${codigo}&Tipo=4&PresID=1`,
        // Semáforo 2 = sin stock: el sitio no deja sumarlo.
        carrito:
          mas !== undefined && dato('SemaforoStock') !== '2'
            ? {
                articulo: codigo,
                tipo: dato('Tipo'),
                pres: dato('PresID'),
                promo: dato('PromoID'),
                minima: Number(dato('CantidadMinima')) || 0,
                enCarrito: Number.isFinite(enCarrito) ? enCarrito : 0,
              }
            : undefined,
      },
    ];
  });
  // Hay tarjetas pero ninguna se pudo leer: no es "sin resultados", cambió el formato.
  if (tarjetas.length > 0 && articulos.length === 0) throw cambio('PIRELLI');
  return {
    articulos,
    total: articulos.length,
    porPagina: Math.max(1, articulos.length),
    orden: 0,
  };
}

const abSchema = z.object({
  lista: z.string(),
  // Sin la lista de descuentos no se sabe la bonificación: tomarla como 0 inflaría el costo.
  descuentos: z
    .array(
      z.object({
        grupo: z.string(),
        articulo: z.coerce.string(),
        descuento1: z.number().catch(0),
        descuento2: z.number().catch(0),
      }),
    ),
  respuesta: z.object({
    total: z.number().optional().catch(undefined),
    data: z.array(z.unknown()),
  }),
});

const abProducto = z.object({
  erp: z.coerce.string().catch(''),
  sku: z.coerce.string(),
  titulo: z.string(),
  totalStock: z.coerce.number().catch(0),
  categorias: z.array(z.object({ id: z.string() })).catch([]),
  variables: z.array(z.object({ nombre: z.string(), valor: z.coerce.string() })).catch([]),
  lista_de_precios: z.array(z.object({ list_id: z.coerce.string(), precio: z.coerce.number() })),
});

/** Arma el resultado con la respuesta de la API de ab Repuestos: precio de la lista de la cuenta y sus descuentos en cascada. */
export function leerAb(datos: unknown): Resultado {
  const r = abSchema.safeParse(datos);
  if (!r.success) throw cambio('AB', r.error);
  const { lista, descuentos, respuesta } = r.data;
  const articulos = cadaUno(
    'AB',
    // El carrito recibe el producto tal como vino.
    respuesta.data.map((x) => ({ ...(x as object), __crudo: x })),
    abProducto.extend({ __crudo: z.record(z.string(), z.unknown()) }),
  ).flatMap(({ __crudo: crudo, ...p }): Articulo[] => {
    const precio = p.lista_de_precios.find((l) => l.list_id === lista)?.precio;
    if (precio === undefined) return [];
    const grupos = new Set(p.categorias.map((c) => c.id));
    const delGrupo = descuentos.filter((d) => grupos.has(d.grupo));
    // El descuento propio del artículo gana sobre el de toda la línea ("0").
    const d = delGrupo.find((x) => x.articulo === p.erp || x.articulo === p.sku) ?? delGrupo.find((x) => x.articulo === '0');
    const bonif = d ? Math.round((1 - (1 - d.descuento1 / 100) * (1 - d.descuento2 / 100)) * 10000) / 100 : 0;
    const marca = p.variables.find((v) => v.nombre === 'marca')?.valor ?? '';
    // shortcut: tramos copiados de /configuration (estados_productos); leerlos de ahí si el sitio los cambia.
    const [estado, stock] = p.totalStock >= 10 ? ['Disponible', 'disponible'] : p.totalStock > 0 ? ['Stock mínimo', 'bajostock'] : ['Sin stock', ''];
    // shortcut: usa el IVA de Configuración para todo; el sitio trae la alícuota de cada artículo (variables.alicuota) si alguno no es 21 %.
    return [
      {
        codigo: p.sku,
        detalle: p.titulo.trim(),
        estado,
        stock,
        imagen: `${AB}/Imagenes/Articulos/${encodeURIComponent(p.sku)}/1.jpg`,
        unidad: '',
        empaque: '',
        infoAdicional: marca && `Marca: ${marca}`,
        lista: precio,
        bonif,
        url: `${AB}/product-list/product/${encodeURIComponent(p.erp)}`,
        carrito: crudo,
      },
    ];
  });
  return {
    articulos,
    total: respuesta.total ?? articulos.length,
    porPagina: Math.max(1, respuesta.data.length),
    orden: 0,
  };
}

const changomaxSchema = z.object({
  // Sin resultados el sitio manda null.
  pagination: z.object({ total_items: z.number().nullish() }).catch({ total_items: null }),
  products: z.array(z.unknown()),
});

const changomaxProducto = z
  .object({
    id_product: z.coerce.string(),
    // Combinación (talle, color…); sin ella, 0. Coerce convertiría undefined en el texto "undefined".
    id_product_attribute: z.union([z.string(), z.number()]).catch('0').transform(String),
    reference: z.string().catch(''),
    name: z.string(),
    // Si falta el número, se lee el precio escrito ("ARS 7.278,20").
    price_amount: z.number().optional().catch(undefined),
    price: z.string().catch(''),
    regular_price_amount: z.number().catch(0),
    url: z.string().catch(''),
    category_name: z.string().nullish().catch(null),
    cover: z
      .object({ bySize: z.object({ home_default: z.object({ url: z.string() }) }) })
      .nullish()
      .catch(null),
  })
  .transform((p) => ({ ...p, precio: p.price_amount ?? aNumero(p.price) }))
  .refine((p) => Number.isFinite(p.precio), { message: 'sin precio', path: ['price_amount'] });

/** Arma el resultado con el JSON del buscador de Changomax. Precios sin impuestos; si hay oferta, la bonificación es la rebaja. */
export function leerChangomax(datos: unknown): Resultado {
  const r = changomaxSchema.safeParse(datos);
  if (!r.success) throw cambio('MAX', r.error);
  const articulos = cadaUno('MAX', r.data.products, changomaxProducto).map((p): Articulo => {
    const lista = Math.max(p.regular_price_amount, p.precio);
    return {
      codigo: p.reference.trim() || p.id_product,
      detalle: p.name.trim(),
      // El sitio no muestra stock.
      estado: 'Sin dato',
      stock: '',
      imagen: p.cover ? encodeURI(p.cover.bySize.home_default.url) : '',
      unidad: '',
      empaque: '',
      infoAdicional: p.category_name ? `Categoría: ${p.category_name}` : '',
      lista,
      bonif: lista > 0 ? Math.round((1 - p.precio / lista) * 10000) / 100 : 0,
      url: p.url,
      carrito: { producto: p.id_product, combinacion: p.id_product_attribute },
    };
  });
  return { articulos, total: r.data.pagination.total_items ?? articulos.length, porPagina: Math.max(1, articulos.length), orden: 0 };
}

const login = (proveedor: IdProveedor) => invoke<void>('prov_login', { proveedor });

interface CarritoNeumat {
  articulo: string;
  tipo: string;
  pres: string;
  promo: string;
  minima: number;
  enCarrito: number;
}

/** PIRELLI recibe el total del artículo en el carrito, no lo que se suma: se parte de lo que mostró el listado. */
async function carritoNeumat(a: Articulo, cantidad: number) {
  const c = a.carrito as unknown as CarritoNeumat;
  const total = Math.max(c.enCarrito + cantidad, c.minima);
  await llamar<void>('neumat_carrito', { articulo: c.articulo, cantidad: total, tipo: c.tipo, pres: c.pres, promo: c.promo });
  c.enCarrito = total;
}

const abrirEnNavegador = async (a: Articulo) => {
  if (a.url) await openUrl(a.url);
};

export const PROVEEDORES: Proveedor[] = [
  {
    id: 'cba',
    nombre: 'Córdoba Motos',
    nombreCorto: 'CM',
    sitio: 'cbamotos.com.ar',
    login: () => login('cba'),
    buscar: buscarCba,
    accion: accionCba,
    ficha: fichaCba,
    abrir: (a) => abrirCba(a.codigo),
    agregarAlCarrito: carritoCba,
  },
  {
    id: 'neumat',
    nombre: 'Neumat',
    nombreCorto: 'PIRELLI',
    sitio: 'neumatmotos.com.ar',
    login: () => login('neumat'),
    buscar: async (texto) => leerNeumat(await llamar<string>('neumat_buscar', { texto })),
    abrir: abrirEnNavegador,
    agregarAlCarrito: carritoNeumat,
  },
  {
    id: 'ab',
    nombre: 'ab Repuestos',
    nombreCorto: 'AB',
    sitio: 'ventas.fundasparamotosab.com.ar',
    login: () => login('ab'),
    buscar: async (texto) => leerAb(leerJson('AB', await llamar<string>('ab_buscar', { texto }))),
    abrir: abrirEnNavegador,
    agregarAlCarrito: (a, cantidad) => llamar<void>('ab_carrito', { producto: a.carrito, cantidad }),
  },
  {
    id: 'changomax',
    nombre: 'Changomax',
    nombreCorto: 'MAX',
    sitio: 'changomax.mercomaxsa.com.ar',
    login: () => login('changomax'),
    buscar: async (texto) => leerChangomax(leerJson('MAX', await llamar<string>('changomax_buscar', { texto }))),
    abrir: abrirEnNavegador,
    agregarAlCarrito: (a, cantidad) => llamar<void>('changomax_carrito', { ...a.carrito, cantidad }),
  },
];

export const proveedor = (id: IdProveedor) => PROVEEDORES.find((p) => p.id === id) ?? PROVEEDORES[0]!;

/** Usuario guardado del proveedor (la contraseña nunca vuelve a la interfaz). */
export const usuarioGuardado = (id: IdProveedor) => invoke<string | null>('cred_usuario', { proveedor: id });
export const guardarCuenta = (id: IdProveedor, usuario: string, clave: string) => invoke<void>('cred_guardar', { proveedor: id, usuario, clave });
export const borrarCuenta = (id: IdProveedor) => invoke<void>('cred_borrar', { proveedor: id });
