import { CONFIG_INICIAL, validarConfig, type Config } from './schema';
import { copiarDanado, guardarClave, leerClave } from './almacen';

const ARCHIVO = 'config.json';
const CLAVE = 'config';

export type Carga = { config: Config; aviso: string | null };

/**
 * Lee la configuración. Si el archivo no existe arranca con la por defecto; si está dañado lo copia
 * aparte antes de seguir, para que el próximo guardado automático no lo pise sin dejar rastro.
 */
export async function cargarConfig(): Promise<Carga> {
  const crudo = await leerClave(ARCHIVO, CLAVE);
  if (crudo === undefined || crudo === null) return { config: CONFIG_INICIAL, aviso: null };
  const r = validarConfig(crudo);
  if (r.ok) return { config: r.config, aviso: null };
  const ruta = await copiarDanado('config-danada', crudo);
  const copia = ruta ? ` Se guardó una copia en ${ruta}.` : '';
  return { config: CONFIG_INICIAL, aviso: `No se pudo leer la configuración guardada (${r.error}) Se empezó con la configuración por defecto.${copia}` };
}

export const guardarConfig = (config: Config) => guardarClave(ARCHIVO, CLAVE, config);
