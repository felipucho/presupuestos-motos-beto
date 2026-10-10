import { z } from 'zod';
import { copiarDanado, guardarClave, leerClave } from './almacen';
import { copiaDiaria } from './copia-diaria';

/** Foto de lo que se presupuestó: no cambia si después se edita el catálogo o el vendedor. */
export const registroSchema = z.object({
  id: z.string().min(1),
  numero: z.string(),
  fecha: z.iso.datetime(),
  vendedor: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  cliente: z.object({ nombre: z.string(), telefono: z.string() }),
  motos: z
    .array(
      z.object({
        marca: z.string(),
        modelo: z.string(),
        cilindrada: z.string(),
        color: z.string(),
        precioLista: z.number(),
        patentamiento: z.number(),
        totalContado: z.number().nullable(),
      }),
    )
    .min(1),
  archivo: z.string(),
});

export type Registro = z.infer<typeof registroSchema>;

const ARCHIVO = 'historial.json';
const CLAVE = 'presupuestos';
const CLAVE_LOCAL = 'historial';

let danadoCopiado: Promise<string | null> | null = null;

/**
 * Devuelve los registros válidos, del más viejo al más nuevo. Si hay alguno dañado lo copia aparte
 * antes de seguir, porque el próximo guardado reescribe el archivo sin él.
 */
export async function cargarHistorial(): Promise<{ registros: Registro[]; aviso: string | null }> {
  const crudo = await leerClave(ARCHIVO, CLAVE, CLAVE_LOCAL);
  if (crudo === undefined || crudo === null) return { registros: [], aviso: null };
  const lista = Array.isArray(crudo) ? crudo : [];
  const registros = lista
    .flatMap((x) => {
      const r = registroSchema.safeParse(x);
      return r.success ? [r.data] : [];
    })
    // El orden lo fija acá, no el del archivo: el gráfico y el corte de la lista dependen de él.
    .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
  const malos = Array.isArray(crudo) ? lista.length - registros.length : 1;
  if (malos === 0) return { registros, aviso: null };
  // Una copia por sesión alcanza: se lee en cada pantalla y cada guardado, y si no se acumularían iguales.
  danadoCopiado ??= copiarDanado('historial-danado', crudo);
  const ruta = await danadoCopiado;
  const copia = ruta ? ` Se guardó una copia en ${ruta}.` : '';
  return { registros, aviso: `Había ${malos === 1 ? 'un registro dañado' : `${malos} registros dañados`} en el historial y se dejaron afuera.${copia}` };
}

const escribir = async (lista: Registro[]) => {
  await guardarClave(ARCHIVO, CLAVE, lista, CLAVE_LOCAL);
  copiaDiaria();
};

// Una escritura por vez: cada una lee lo último que dejó la anterior.
let cola: Promise<unknown> = Promise.resolve();
function enCola<T>(f: () => Promise<T>): Promise<T> {
  const p = cola.then(f);
  cola = p.catch(() => undefined);
  return p;
}

export const agregarRegistro = (r: Registro) =>
  enCola(async () => {
    const { registros } = await cargarHistorial();
    await escribir([...registros, r]);
  });

export const borrarRegistro = (id: string) =>
  enCola(async () => {
    const { registros } = await cargarHistorial();
    await escribir(registros.filter((r) => r.id !== id));
  });

/** Para importar un backup: reemplaza todo el historial. */
export const reemplazarHistorial = (lista: Registro[]) => enCola(() => escribir(lista));
