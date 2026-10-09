import { documentDir, join } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { mkdir, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';

const PDF = { name: 'PDF', extensions: ['pdf'] };
const CSV = { name: 'CSV (Excel)', extensions: ['csv'] };

export const carpetaPorDefecto = async (): Promise<string> => join(await documentDir(), 'Presupuestos Motos Beto');

export async function elegirCarpeta(actual: string): Promise<string | null> {
  const r = await open({ title: 'Carpeta de los presupuestos', directory: true, multiple: false, defaultPath: actual });
  return typeof r === 'string' ? r : null;
}

/** Abre "Guardar como" con `ruta` sugerida y escribe el contenido. Devuelve la ruta, o null si se canceló. */
export async function guardarArchivo(
  o: { titulo: string; ruta: string; filtro: { name: string; extensions: string[] } },
  contenido: Uint8Array | string,
): Promise<string | null> {
  const ruta = await save({ title: o.titulo, defaultPath: o.ruta, filters: [o.filtro] });
  if (!ruta) return null;
  if (typeof contenido === 'string') await writeTextFile(ruta, contenido);
  else await writeFile(ruta, contenido);
  return ruta;
}

/** Guarda un PDF en la carpeta dada (o la de Documentos). Devuelve la ruta, o null si se canceló. */
export async function guardarPdf(bytes: Uint8Array, nombre: string, carpeta: string | null, titulo = 'Guardar presupuesto'): Promise<string | null> {
  const destino = carpeta ?? (await carpetaPorDefecto());
  if (carpeta === null) await mkdir(destino, { recursive: true }).catch(() => undefined); // si falla, el diálogo cae en otra carpeta
  return guardarArchivo({ titulo, ruta: await join(destino, nombre), filtro: PDF }, bytes);
}

/** Guarda un CSV en Documentos. Devuelve la ruta, o null si se canceló. */
export async function guardarCsv(texto: string, nombre: string): Promise<string | null> {
  return guardarArchivo({ titulo: 'Exportar', ruta: await join(await documentDir(), nombre), filtro: CSV }, texto);
}

export const abrirArchivo = (ruta: string) => openPath(ruta);

/** Sólo enlaces de WhatsApp: es lo único que la app tiene permitido abrir en el navegador. */
export const abrirWhatsapp = (url: string) => openUrl(url);
