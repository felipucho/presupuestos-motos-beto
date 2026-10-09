import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { appDataDir, join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import type { z } from 'zod';
import { copiarDanado, guardarClave, leerClave } from './almacen';
import { clienteSchema, diaDe, FIADOS_VACIO, movimientoSchema, sumarItem, type Fiados, type Item } from './fiados';
import { enTauri } from './entorno';
import { reintentarSiPendiente, respaldarSinEsperar } from './respaldo';

const ARCHIVO = 'fiados.json';
const CLAVE = 'fiados';

export async function guardarFiados(f: Fiados): Promise<void> {
  await guardarClave(ARCHIVO, CLAVE, f);
}

const validos = <T,>(lista: unknown, schema: z.ZodType<T>): T[] =>
  (Array.isArray(lista) ? lista : []).flatMap((x) => {
    const r = schema.safeParse(x);
    return r.success ? [r.data] : [];
  });

/**
 * Lee los fiados. Lo dañado se deja afuera y se copia aparte antes de seguir, porque el próximo
 * guardado reescribe el archivo sin eso. Los movimientos de un cliente dañado también quedan afuera.
 */
export async function cargarFiados(): Promise<{ fiados: Fiados; aviso: string | null }> {
  const crudo = await leerClave(ARCHIVO, CLAVE);
  if (crudo === undefined || crudo === null) return { fiados: FIADOS_VACIO, aviso: null };
  const o = (typeof crudo === 'object' ? crudo : {}) as { clientes?: unknown; movimientos?: unknown };
  const clientes = validos(o.clientes, clienteSchema);
  const ids = new Set(clientes.map((c) => c.id));
  const movimientos = validos(o.movimientos, movimientoSchema).filter((m) => ids.has(m.clienteId));
  const largo = (x: unknown) => (Array.isArray(x) ? x.length : 1);
  const malos = largo(o.clientes) + largo(o.movimientos) - clientes.length - movimientos.length;
  const fiados = { clientes, movimientos };
  if (malos === 0) {
    await copiaDiaria(fiados);
    return { fiados, aviso: null };
  }
  const ruta = await copiarDanado('fiados-danado', crudo);
  const copia = ruta ? ` Se guardó una copia del archivo original en ${ruta}.` : '';
  return { fiados, aviso: `Había ${malos === 1 ? 'un dato dañado' : `${malos} datos dañados`} en los fiados y se dejaron afuera.${copia}` };
}

/**
 * Una copia por día en la carpeta de la app, con el día del mes en el nombre: se pisan solas
 * al mes siguiente y siempre quedan las de los últimos 30 días, sin tener que borrar nada.
 */
async function copiaDiaria(f: Fiados) {
  if (!enTauri || f.clientes.length === 0) return;
  const hoy = diaDe(new Date());
  try {
    if ((await leerClave(ARCHIVO, 'ultimaCopia')) === hoy) return;
    await writeTextFile(await join(await appDataDir(), `copia-fiados-dia-${hoy.slice(8)}.json`), JSON.stringify({ dia: hoy, fiados: f }, null, 2));
    await guardarClave(ARCHIVO, 'ultimaCopia', hoy);
  } catch (e) {
    toast.warning('No se pudo hacer la copia diaria de los fiados', { description: String(e) });
  }
}

/** Fiado que se está armando desde Precios de repuestos, antes de elegir cliente o confirmar. */
export interface Armado {
  clienteId: string | null;
  items: Item[];
}

interface Ctx {
  fiados: Fiados | null;
  errorCarga: string | null;
  /** Aplica el cambio y lo guarda en segundo plano. */
  cambiar: (cambio: (f: Fiados) => Fiados, mensaje?: string | false) => void;
  /** Reemplaza todo y espera a que quede escrito: la promesa falla si el disco falla. */
  reemplazar: (f: Fiados) => Promise<void>;
  armado: Armado;
  setArmado: Dispatch<SetStateAction<Armado>>;
  agregarAlArmado: (i: Item) => void;
  /** Pide a la pantalla de Fiados que abra el armado al entrar. */
  pedirArmado: boolean;
  setPedirArmado: (v: boolean) => void;
}

const FiadosCtx = createContext<Ctx | null>(null);

export function useFiados(): Ctx {
  const c = useContext(FiadosCtx);
  if (!c) throw new Error('useFiados fuera de FiadosProvider');
  return c;
}

export const ARMADO_VACIO: Armado = { clienteId: null, items: [] };

export function FiadosProvider({ children }: { children: ReactNode }) {
  const [fiados, setFiados] = useState<Fiados | null>(null);
  const [armado, setArmado] = useState<Armado>(ARMADO_VACIO);
  const [pedirArmado, setPedirArmado] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Serializa las escrituras: cada guardado espera al anterior, así nunca gana uno viejo.
  const cola = useRef(Promise.resolve());
  const actual = useRef<Fiados | null>(null);

  useEffect(() => {
    cargarFiados()
      .then(({ fiados, aviso }) => {
        actual.current = fiados;
        setFiados(fiados);
        if (aviso) toast.error('Fiados dañados', { description: aviso, duration: Infinity });
        void reintentarSiPendiente(fiados);
      })
      .catch((e: unknown) => setErrorCarga(String(e)));
  }, []);

  const escribir = useCallback((f: Fiados) => {
    const p = cola.current.then(() => guardarFiados(f));
    cola.current = p.catch(() => undefined);
    // Primero queda en esta computadora; la copia a GitHub va después, sin frenar los guardados siguientes.
    p.then(() => respaldarSinEsperar(f)).catch(() => undefined);
    return p;
  }, []);

  const cambiar = useCallback<Ctx['cambiar']>(
    (cambio, mensaje = false) => {
      const prev = actual.current;
      if (!prev) return void toast.error('No se pueden guardar cambios: los fiados todavía no se cargaron.');
      const next = cambio(prev);
      if (next === prev) return;
      actual.current = next;
      setFiados(next);
      escribir(next)
        .then(() => {
          if (mensaje) toast.success(mensaje);
        })
        .catch((e: unknown) => {
          toast.error('No se pudo guardar el fiado', { description: `${String(e)}. Lo último no quedó guardado: cerrá y volvé a abrir la app antes de seguir.`, duration: Infinity });
        });
    },
    [escribir],
  );

  const reemplazar = useCallback<Ctx['reemplazar']>(
    (f) => {
      actual.current = f;
      setFiados(f);
      return escribir(f);
    },
    [escribir],
  );

  const agregarAlArmado = useCallback((i: Item) => setArmado((a) => ({ ...a, items: sumarItem(a.items, i) })), []);

  const value = useMemo<Ctx>(
    () => ({ fiados, errorCarga, cambiar, reemplazar, armado, setArmado, agregarAlArmado, pedirArmado, setPedirArmado }),
    [fiados, errorCarga, cambiar, reemplazar, armado, agregarAlArmado, pedirArmado],
  );

  return <FiadosCtx.Provider value={value}>{children}</FiadosCtx.Provider>;
}
