import { appDataDir, join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { load, type Store } from '@tauri-apps/plugin-store';
import { z } from 'zod';
import { enTauri } from './storage';

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

const CLAVE = 'presupuestos';
let store: Store | null = null;
const abrirStore = async () => (store ??= await load('historial.json', { defaults: {}, autoSave: false }));

async function leerCrudo(): Promise<unknown> {
  if (!enTauri) {
    const t = localStorage.getItem('historial');
    return t ? (JSON.parse(t) as unknown) : null;
  }
  return (await abrirStore()).get<unknown>(CLAVE);
}

async function escribir(lista: Registro[]) {
  if (!enTauri) return void localStorage.setItem('historial', JSON.stringify(lista));
  const s = await abrirStore();
  await s.set(CLAVE, lista);
  await s.save();
}

/**
 * Devuelve los registros válidos, del más viejo al más nuevo. Si hay alguno dañado lo copia aparte
 * antes de seguir, porque el próximo guardado reescribe el archivo sin él.
 */
export async function cargarHistorial(): Promise<{ registros: Registro[]; aviso: string | null }> {
  const crudo = await leerCrudo();
  if (crudo === undefined || crudo === null) return { registros: [], aviso: null };
  const lista = Array.isArray(crudo) ? crudo : [];
  const registros = lista.flatMap((x) => {
    const r = registroSchema.safeParse(x);
    return r.success ? [r.data] : [];
  });
  const malos = Array.isArray(crudo) ? lista.length - registros.length : 1;
  if (malos === 0) return { registros, aviso: null };
  let copia = '';
  if (enTauri) {
    const ruta = await join(await appDataDir(), `historial-danado-${Date.now()}.json`);
    await writeTextFile(ruta, JSON.stringify(crudo, null, 2));
    copia = ` Se guardó una copia en ${ruta}.`;
  }
  return { registros, aviso: `Había ${malos === 1 ? 'un registro dañado' : `${malos} registros dañados`} en el historial y se dejaron afuera.${copia}` };
}

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
