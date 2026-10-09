import { appDataDir, documentDir, join } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { z } from 'zod';
import { fiadosSchema, type Fiados } from './fiados';
import { fechaCompacta } from './formato';
import { registroSchema, type Registro } from './historial';
import { validarConfig, type Config } from './schema';

const TIPO = 'motos-beto-backup';

export interface Backup {
  config: Config;
  historial: Registro[];
  fiados: Fiados;
}

/** Lo que trae un archivo. historial y fiados son null en un backup viejo, que sólo tenía la configuración. */
export type Importado = { config: Config; historial: Registro[] | null; fiados: Fiados | null };

const completoSchema = z.object({ tipo: z.literal(TIPO), version: z.literal(1), historial: z.array(registroSchema), fiados: fiadosSchema });

/** Valida un backup completo o uno viejo de sólo configuración. Lanza Error con un mensaje legible. */
export function leerDatosBackup(datos: unknown): Importado {
  const o = (typeof datos === 'object' && datos !== null ? datos : {}) as { tipo?: unknown; config?: unknown };
  if (o.tipo !== TIPO) {
    const r = validarConfig(datos);
    if (!r.ok) throw new Error(r.error);
    return { config: r.config, historial: null, fiados: null };
  }
  const c = validarConfig(o.config);
  if (!c.ok) throw new Error(c.error);
  const r = completoSchema.safeParse(datos);
  if (!r.success) {
    const p = r.error.issues[0];
    throw new Error(`Dato inválido en «${p?.path.join('.') ?? '?'}»: ${p?.message ?? 'formato incorrecto'}.`);
  }
  return { config: c.config, historial: r.data.historial, fiados: r.data.fiados };
}

const contenido = (b: Backup) => JSON.stringify({ tipo: TIPO, version: 1, creado: new Date().toISOString(), ...b }, null, 2);

/** Devuelve la ruta elegida, o null si se canceló. */
export async function exportarBackup(b: Backup): Promise<string | null> {
  const ruta = await save({
    title: 'Exportar backup',
    defaultPath: await join(await documentDir(), `motos-beto-backup-${fechaCompacta(new Date())}.json`),
    filters: [{ name: 'Backup', extensions: ['json'] }],
  });
  if (!ruta) return null;
  await writeTextFile(ruta, contenido(b));
  return ruta;
}

/** null si se canceló; lanza Error con mensaje legible si el archivo no sirve. */
export async function leerBackup(): Promise<Importado | null> {
  const ruta = await open({ title: 'Importar backup', multiple: false, directory: false, filters: [{ name: 'Backup', extensions: ['json'] }] });
  if (!ruta) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(await readTextFile(ruta));
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  return leerDatosBackup(datos);
}

/** Copia de todo lo actual en la carpeta de la app, antes de pisarlo con un backup importado. */
export async function copiaAntesDeImportar(b: Backup): Promise<string> {
  const ruta = await join(await appDataDir(), `antes-de-importar-${Date.now()}.json`);
  await writeTextFile(ruta, contenido(b));
  return ruta;
}
