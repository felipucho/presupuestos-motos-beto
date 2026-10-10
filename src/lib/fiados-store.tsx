import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { copiarDanado, guardarClave, leerClave } from './almacen';
import { copiaDiaria } from './copia-diaria';
import { clienteSchema, FIADOS_VACIO, movimientoSchema, sumarItem, type Fiados, type Item } from './fiados';
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
  if (malos === 0) return { fiados, aviso: null };
  const ruta = await copiarDanado('fiados-danado', crudo);
  const copia = ruta ? ` Se guardó una copia del archivo original en ${ruta}.` : '';
  return { fiados, aviso: `Había ${malos === 1 ? 'un dato dañado' : `${malos} datos dañados`} en los fiados y se dejaron afuera.${copia}` };
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
  const reintentando = useRef(false);

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
    // Primero queda en esta computadora; las copias van después, sin frenar los guardados siguientes.
    p.then(() => {
      copiaDiaria();
      respaldarSinEsperar(f);
    }).catch(() => undefined);
    return p;
  }, []);

  // Cada guardado escribe todo: si uno falla, reintentar con lo último alcanza para no perder nada.
  const reintentar = useCallback(() => {
    if (reintentando.current) return;
    reintentando.current = true;
    const intento = () =>
      setTimeout(() => {
        escribir(actual.current!)
          .then(() => {
            reintentando.current = false;
            toast.success('Fiados guardados', { id: 'guardado-fiados', duration: 4000 });
          })
          .catch(intento);
      }, 5000);
    intento();
  }, [escribir]);

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
          toast.error('No se pudo guardar el fiado', {
            id: 'guardado-fiados',
            description: `${String(e)}. Se reintenta solo cada 5 segundos: no cierres la app hasta que diga «Fiados guardados».`,
            duration: Infinity,
          });
          reintentar();
        });
    },
    [escribir, reintentar],
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
