import { z } from 'zod';
import { enlaceWhatsapp } from './formato';

export const SCHEMA_VERSION = 1;

const texto = z.string().trim();

export const localSchema = z.object({
  nombre: texto.min(1, 'Ingresá el nombre del local'),
  direccion: texto,
  telefono: texto,
  whatsapp: texto,
  instagram: texto,
  prefijo: texto
    .min(1, 'Ingresá un prefijo')
    .max(8, 'Máximo 8 caracteres')
    .regex(/^[A-Za-z0-9]+$/, 'Solo letras y números, sin espacios'),
  textoLegal: texto,
  carpetaPdf: z.string().nullable(),
});

export const planSchema = z.object({
  id: z.string().min(1),
  cuotas: z.int('Tiene que ser un número entero').min(1, 'Mínimo 1 cuota').max(120, 'Máximo 120 cuotas'),
  recargo: z.number().min(0, 'No puede ser negativo').max(1000, 'Revisá el recargo'),
});

export const gastoSchema = z.object({
  id: z.string().min(1),
  nombre: texto.min(1, 'Ingresá un nombre'),
  monto: z.number().min(0, 'No puede ser negativo'),
});

export const motoSchema = z.object({
  id: z.string().min(1),
  marca: texto.min(1, 'Ingresá la marca'),
  modelo: texto.min(1, 'Ingresá el modelo'),
  cilindrada: texto,
  colores: z.array(texto.min(1)),
  precioLista: z.number().positive('El precio tiene que ser mayor a $\u00a00'),
  // Con default para leer configuraciones y backups anteriores a este campo.
  patentamiento: z.number().min(0, 'No puede ser negativo').default(0),
});

export const vendedorSchema = z.object({
  id: z.string().min(1),
  nombre: texto.min(1, 'Ingres\u00e1 el nombre'),
  telefono: texto.refine((t) => enlaceWhatsapp(t) !== null, 'Celular con c\u00f3digo de \u00e1rea, sin 0 ni 15 (10 n\u00fameros)'),
});

export const configSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  local: localSchema,
  vendedores: z.array(vendedorSchema).default([]),
  descuentoContado: z.number().min(0, 'No puede ser negativo').max(99, 'Máximo 99 %'),
  planesTarjeta: z.array(planSchema),
  gastos: z.array(gastoSchema),
  motos: z.array(motoSchema),
});

export type Local = z.infer<typeof localSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Gasto = z.infer<typeof gastoSchema>;
export type Moto = z.infer<typeof motoSchema>;
export type Vendedor = z.infer<typeof vendedorSchema>;
export type Config = z.infer<typeof configSchema>;

export const CONFIG_INICIAL: Config = {
  schemaVersion: SCHEMA_VERSION,
  local: {
    nombre: 'Motos Beto',
    direccion: 'B. Mitre 310, Las Varillas, Córdoba',
    telefono: '',
    whatsapp: '',
    instagram: '',
    prefijo: 'MB',
    textoLegal: 'Precios sujetos a modificación sin previo aviso.',
    carpetaPdf: null,
  },
  vendedores: [],
  descuentoContado: 0,
  planesTarjeta: [],
  gastos: [],
  motos: [],
};

/** Valida un JSON de configuración y devuelve un mensaje legible si falla. */
export function validarConfig(datos: unknown): { ok: true; config: Config } | { ok: false; error: string } {
  if (typeof datos !== 'object' || datos === null) return { ok: false, error: 'El archivo no tiene una configuración válida.' };
  const version = (datos as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number') return { ok: false, error: 'Falta la versión del archivo (schemaVersion).' };
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: `El archivo es de una versión más nueva de la app (v${version}). Actualizá la app para importarlo.` };
  }
  const r = configSchema.safeParse(datos);
  if (r.success) return { ok: true, config: r.data };
  const p = r.error.issues[0];
  return { ok: false, error: `Dato inválido en «${p?.path.join('.') ?? '?'}»: ${p?.message ?? 'formato incorrecto'}.` };
}

/** Primer mensaje de error por campo, para validación inline. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? '');
    out[k] ??= i.message;
  }
  return out;
}

export const nuevoId = () => crypto.randomUUID();
