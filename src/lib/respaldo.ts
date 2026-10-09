import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { guardarClave, leerClave } from './almacen';
import { diaDe, type Fiados } from './fiados';
import { enTauri } from './entorno';

// Sólo el estado de la última subida. El token vive en el Administrador de credenciales (respaldo.rs), nunca acá.
const ARCHIVO = 'respaldo.json';
const CLAVE = 'estado';
/** Se dispara cada vez que cambia el estado, para que Configuración se actualice sola. */
export const EVENTO_RESPALDO = 'respaldo-cambio';

export interface EstadoRespaldo {
  ultimaSubida: string | null;
  /** Cambios que todavía no llegaron al repo: se marca antes de cada subida y se limpia cuando sale bien. */
  pendiente: boolean;
  error: string | null;
}
const SIN_SUBIDAS: EstadoRespaldo = { ultimaSubida: null, pendiente: false, error: null };

export type Resultado = { estado: 'ok' } | { estado: 'sin_repo' } | { estado: 'error'; error: string };

export const repoConectado = () => invoke<string | null>('respaldo_estado');
export const conectarRespaldo = (repo: string, token: string) => invoke<string>('respaldo_conectar', { repo, token });

export async function desconectarRespaldo() {
  await invoke('respaldo_desconectar');
  await guardarEstado(SIN_SUBIDAS);
}

export async function leerEstadoRespaldo(): Promise<EstadoRespaldo> {
  return ((await leerClave(ARCHIVO, CLAVE)) as EstadoRespaldo | null) ?? SIN_SUBIDAS;
}

async function guardarEstado(e: EstadoRespaldo) {
  await guardarClave(ARCHIVO, CLAVE, e);
  window.dispatchEvent(new Event(EVENTO_RESPALDO));
}

/** Lo que se sube: los fiados tal cual están guardados, más cuándo se armó la copia. */
export const contenidoRespaldo = (f: Fiados) => JSON.stringify({ tipo: 'motos-beto-fiados', version: 1, creado: new Date().toISOString(), fiados: f }, null, 2);

const cuando = () => {
  const d = new Date();
  return `${diaDe(d)} ${d.toTimeString().slice(0, 5)}`;
};

// Una subida a la vez. Si llegan cambios mientras sube, alcanza con el más nuevo: los del medio no hacen falta.
let ultimo: Fiados | null = null;
let trabajo: Promise<Resultado | null> | null = null;

async function subirUna(f: Fiados): Promise<Resultado> {
  try {
    if (!(await repoConectado())) return { estado: 'sin_repo' };
    // Queda marcado antes de subir: si la app se cierra a mitad de camino, al abrir se vuelve a intentar.
    await guardarEstado({ ...(await leerEstadoRespaldo()), pendiente: true });
    await invoke('respaldo_subir', { contenido: contenidoRespaldo(f), mensaje: `Respaldo de fiados ${cuando()}` });
  } catch (e) {
    const error = String(e);
    await guardarEstado({ ...(await leerEstadoRespaldo()), pendiente: true, error });
    return { estado: 'error', error };
  }
  await guardarEstado({ ultimaSubida: new Date().toISOString(), pendiente: false, error: null });
  return { estado: 'ok' };
}

async function bombear(): Promise<Resultado | null> {
  let r: Resultado | null = null;
  try {
    while (ultimo) {
      const f = ultimo;
      ultimo = null;
      r = await subirUna(f);
      // Sin internet o GitHub caído: no reintenta en bucle. Queda pendiente hasta el próximo cambio o «Subir ahora».
      if (r.estado === 'error') break;
    }
    return r;
  } finally {
    trabajo = null;
  }
}

/** Sube esta versión, o la más nueva si llega otra mientras tanto. Devuelve null fuera de la app de escritorio. */
export function subirFiados(f: Fiados): Promise<Resultado | null> {
  if (!enTauri) return Promise.resolve(null);
  ultimo = f;
  trabajo ??= bombear();
  return trabajo;
}

/** Sube sin frenar a quien guardó (lo local ya quedó hecho) y avisa si no se pudo. */
export function respaldarSinEsperar(f: Fiados) {
  void subirFiados(f).then((r) => {
    if (r?.estado === 'error') toast.warning('No se pudo subir la copia de los fiados a GitHub', { id: 'respaldo', description: 'Queda pendiente: se reintenta con el próximo cambio o con «Subir ahora» en Configuración.' });
  });
}

/** Al abrir la app: si la última subida quedó pendiente, la vuelve a intentar. */
export async function reintentarSiPendiente(f: Fiados) {
  if (enTauri && (await leerEstadoRespaldo()).pendiente) respaldarSinEsperar(f);
}
