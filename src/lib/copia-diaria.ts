import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { leerClave } from './almacen';
import { enTauri } from './entorno';
import { diaDe, FIADOS_VACIO } from './fiados';
import { CONFIG_INICIAL } from './schema';

export const TIPO_BACKUP = 'motos-beto-backup';

/** Un backup completo, con el formato que acepta Importar. */
export const contenidoBackup = (b: { config: unknown; historial: unknown; fiados: unknown }) =>
  JSON.stringify({ tipo: TIPO_BACKUP, version: 1, creado: new Date().toISOString(), ...b }, null, 2);

let cola: Promise<void> = Promise.resolve();

async function hacer() {
  const [config, historial, fiados] = await Promise.all([leerClave('config.json', 'config'), leerClave('historial.json', 'presupuestos'), leerClave('fiados.json', 'fiados')]);
  const contenido = contenidoBackup({ config: config ?? CONFIG_INICIAL, historial: historial ?? [], fiados: fiados ?? FIADOS_VACIO });
  await invoke('copia_diaria', { dia: diaDe(new Date()).slice(8), contenido });
}

/**
 * Después de cada guardado: backup completo del día en Documentos\Presupuestos Motos Beto\copias (ver datos.rs).
 * Se importa desde Configuración → Backup como cualquier backup exportado.
 */
export function copiaDiaria(): void {
  if (!enTauri) return;
  cola = cola
    .then(hacer)
    .catch((e: unknown) => void toast.warning('No se pudo hacer la copia diaria', { id: 'copia-diaria', description: String(e) }));
}
