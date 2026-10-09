import { appDataDir, join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { load, type Store } from '@tauri-apps/plugin-store';
import { enTauri } from './entorno';

// Un store por archivo, abierto una sola vez. Se guarda la promesa: dos llamadas simultáneas no lo abren dos veces.
const stores = new Map<string, Promise<Store>>();
function abrir(archivo: string): Promise<Store> {
  let s = stores.get(archivo);
  if (!s) {
    s = load(archivo, { defaults: {}, autoSave: false }).catch((e: unknown) => {
      stores.delete(archivo); // si falló, el próximo intento vuelve a probar
      throw e;
    });
    stores.set(archivo, s);
  }
  return s;
}

/**
 * Lee una clave. En Tauri sale del archivo JSON de la app; fuera de Tauri, de localStorage con `claveLocal`.
 * Devuelve undefined o null si no hay nada.
 */
export async function leerClave(archivo: string, clave: string, claveLocal = clave): Promise<unknown> {
  if (!enTauri) {
    const t = localStorage.getItem(claveLocal);
    return t ? (JSON.parse(t) as unknown) : null;
  }
  return (await abrir(archivo)).get<unknown>(clave);
}

export async function guardarClave(archivo: string, clave: string, valor: unknown, claveLocal = clave): Promise<void> {
  if (!enTauri) return void localStorage.setItem(claveLocal, JSON.stringify(valor));
  const s = await abrir(archivo);
  await s.set(clave, valor);
  await s.save();
}

/**
 * Copia un dato que no se pudo leer a la carpeta de la app, antes de que el próximo guardado lo pise.
 * Devuelve la ruta, o null fuera de Tauri (no hay carpeta a la que copiar).
 */
export async function copiarDanado(prefijo: string, crudo: unknown): Promise<string | null> {
  if (!enTauri) return null;
  const ruta = await join(await appDataDir(), `${prefijo}-${Date.now()}.json`);
  await writeTextFile(ruta, JSON.stringify(crudo, null, 2));
  return ruta;
}
