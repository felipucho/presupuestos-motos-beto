import { isTauri } from '@tauri-apps/api/core';
import { appDataDir, documentDir, join } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { mkdir, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';
import { load, type Store } from '@tauri-apps/plugin-store';
import { fechaCompacta } from './formato';
import { CONFIG_INICIAL, validarConfig, type Config } from './schema';

const CLAVE = 'config';
// shortcut: fuera de Tauri (vite en el navegador) se guarda en localStorage, sólo para desarrollar la interfaz.
const enTauri = isTauri();

let store: Store | null = null;
const abrirStore = async () => (store ??= await load('config.json', { defaults: {}, autoSave: false }));

export type Carga = { config: Config; aviso: string | null };

/**
 * Lee la configuración. Si el archivo no existe arranca con la por defecto; si está dañado lo copia
 * aparte antes de seguir, para que el próximo guardado automático no lo pise sin dejar rastro.
 */
export async function cargarConfig(): Promise<Carga> {
  const crudo = enTauri ? await (await abrirStore()).get<unknown>(CLAVE) : leerLocal();
  if (crudo === undefined || crudo === null) return { config: CONFIG_INICIAL, aviso: null };
  const r = validarConfig(crudo);
  if (r.ok) return { config: r.config, aviso: null };
  let copia = '';
  if (enTauri) {
    const ruta = await join(await appDataDir(), `config-danada-${Date.now()}.json`);
    await writeTextFile(ruta, JSON.stringify(crudo, null, 2));
    copia = ` Se guardó una copia en ${ruta}.`;
  }
  return { config: CONFIG_INICIAL, aviso: `No se pudo leer la configuración guardada (${r.error}) Se empezó con la configuración por defecto.${copia}` };
}

export async function guardarConfig(config: Config): Promise<void> {
  if (!enTauri) return void localStorage.setItem(CLAVE, JSON.stringify(config));
  const s = await abrirStore();
  await s.set(CLAVE, config);
  await s.save();
}

function leerLocal(): unknown {
  const t = localStorage.getItem(CLAVE);
  return t ? (JSON.parse(t) as unknown) : null;
}

/** Devuelve la ruta elegida, o null si se canceló. */
export async function exportarConfig(config: Config): Promise<string | null> {
  const ruta = await save({
    title: 'Exportar configuración',
    defaultPath: await join(await documentDir(), `motos-beto-configuracion-${fechaCompacta(new Date())}.json`),
    filters: [{ name: 'Configuración', extensions: ['json'] }],
  });
  if (!ruta) return null;
  await writeTextFile(ruta, JSON.stringify(config, null, 2));
  return ruta;
}

/** Lee y valida un backup. null si se canceló; lanza Error con mensaje legible si no sirve. */
export async function leerBackup(): Promise<Config | null> {
  const ruta = await open({ title: 'Importar configuración', multiple: false, directory: false, filters: [{ name: 'Configuración', extensions: ['json'] }] });
  if (!ruta) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(await readTextFile(ruta));
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const r = validarConfig(datos);
  if (!r.ok) throw new Error(r.error);
  return r.config;
}

export async function carpetaPorDefecto(): Promise<string> {
  return join(await documentDir(), 'Presupuestos Motos Beto');
}

export async function elegirCarpeta(actual: string): Promise<string | null> {
  const r = await open({ title: 'Carpeta de los presupuestos', directory: true, multiple: false, defaultPath: actual });
  return typeof r === 'string' ? r : null;
}

/** Abre "Guardar como" y escribe el PDF. Devuelve la ruta, o null si se canceló. */
export async function guardarPdf(bytes: Uint8Array, nombre: string, carpeta: string | null): Promise<string | null> {
  const destino = carpeta ?? (await carpetaPorDefecto());
  if (carpeta === null) await mkdir(destino, { recursive: true }).catch(() => undefined); // si falla, el diálogo cae en otra carpeta
  const ruta = await save({
    title: 'Guardar presupuesto',
    defaultPath: await join(destino, nombre),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!ruta) return null;
  await writeFile(ruta, bytes);
  return ruta;
}

export const abrirArchivo = (ruta: string) => openPath(ruta);

export { enTauri };
