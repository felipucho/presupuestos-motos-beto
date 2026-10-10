import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { enTauri } from './entorno';

type Datos = Record<string, unknown>;

// Cada archivo se lee una sola vez y queda en memoria. Se guarda la promesa: dos llamadas simultáneas no lo leen dos veces.
const abiertos = new Map<string, Promise<Datos>>();
// Una escritura por archivo a la vez y en orden: nunca termina último un contenido viejo.
const colas = new Map<string, Promise<unknown>>();

function abrir(archivo: string): Promise<Datos> {
  let s = abiertos.get(archivo);
  if (!s) {
    s = invoke<{ contenido: string; desde_copia: boolean } | null>('datos_leer', { archivo })
      .then((r) => {
        if (r?.desde_copia)
          toast.warning(`Se recuperó ${archivo} de la copia anterior`, {
            description: 'El archivo estaba dañado (por ejemplo, por un corte de luz). Puede faltar el último cambio que se hizo antes del corte: revisalo.',
            duration: Infinity,
          });
        return r ? (JSON.parse(r.contenido) as Datos) : {};
      })
      .catch((e: unknown) => {
        abiertos.delete(archivo); // si falló, el próximo intento vuelve a probar
        throw e;
      });
    abiertos.set(archivo, s);
  }
  return s;
}

/**
 * Lee una clave. En Tauri sale del archivo JSON de la app; fuera de Tauri, de localStorage con `claveLocal`.
 * Devuelve undefined o null si no hay nada. Lanza si el archivo está dañado y no hay copia para recuperarlo.
 */
export async function leerClave(archivo: string, clave: string, claveLocal = clave): Promise<unknown> {
  if (!enTauri) {
    const t = localStorage.getItem(claveLocal);
    return t ? (JSON.parse(t) as unknown) : null;
  }
  return (await abrir(archivo))[clave];
}

export async function guardarClave(archivo: string, clave: string, valor: unknown, claveLocal = clave): Promise<void> {
  if (!enTauri) return void localStorage.setItem(claveLocal, JSON.stringify(valor));
  const datos = await abrir(archivo);
  // En memoria sólo después de escribir: si el disco falla, lo que no se guardó no se cuela en el próximo guardado.
  const p = (colas.get(archivo) ?? Promise.resolve()).then(async () => {
    await invoke('datos_guardar', { archivo, contenido: JSON.stringify({ ...datos, [clave]: valor }, null, 2) });
    datos[clave] = valor;
  });
  colas.set(archivo, p.catch(() => undefined));
  await p;
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
