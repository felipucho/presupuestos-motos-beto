import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { alCerrarLogin, LoginFallido, SinSesion, type Accion, type Resultado } from './cba';
import type { Proveedor } from './proveedores';

export type Estado =
  | { tipo: 'inicio' }
  | { tipo: 'buscando' }
  /** Hay que entrar a mano; `rechazo` dice por qué falló la entrada automática, si se intentó. */
  | { tipo: 'sin-sesion'; rechazo?: string }
  | { tipo: 'error'; mensaje: string }
  | {
      tipo: 'ok';
      busqueda: string;
      resultado: Resultado;
      pagina: number;
      cargando: boolean;
    };

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

const estadoDeError = (e: unknown): Estado =>
  e instanceof SinSesion ? { tipo: 'sin-sesion' } : e instanceof LoginFallido ? { tipo: 'sin-sesion', rechazo: e.message } : { tipo: 'error', mensaje: mensaje(e) };

/** Búsqueda de precios en un proveedor: estado, búsqueda, paginado y orden. Sin nada de UI. */
export function useBusqueda({ id, buscar: buscarEn, accion: accionEn }: Pick<Proveedor, 'id' | 'buscar' | 'accion'>) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicio' });
  const ultima = useRef('');
  // Descarta respuestas de pedidos viejos si el usuario ya pidió otra cosa.
  const turno = useRef(0);

  const buscar = useCallback(
    async (busqueda: string) => {
      const t = ++turno.current;
      ultima.current = busqueda;
      setEstado({ tipo: 'buscando' });
      try {
        const resultado = await buscarEn(busqueda);
        if (t === turno.current)
          setEstado({
            tipo: 'ok',
            busqueda,
            resultado,
            pagina: 1,
            cargando: false,
          });
      } catch (e) {
        if (t === turno.current) setEstado(estadoDeError(e));
      }
    },
    [buscarEn],
  );

  const accion = async (a: Accion) => {
    if (!accionEn || estado.tipo !== 'ok' || estado.cargando) return;
    const t = ++turno.current;
    const pagina = a.tipo === 'siguiente' ? estado.pagina + 1 : a.tipo === 'anterior' ? estado.pagina - 1 : 1;
    setEstado({ ...estado, cargando: true });
    try {
      const resultado = await accionEn(a);
      if (t === turno.current) setEstado({ ...estado, resultado, pagina, cargando: false });
    } catch (e) {
      if (t !== turno.current) return;
      const otro = estadoDeError(e);
      if (otro.tipo !== 'error') return setEstado(otro);
      setEstado({ ...estado, cargando: false });
      toast.error('No se pudo cargar', { description: mensaje(e) });
    }
  };

  const mostrarError = useCallback((m: string) => setEstado({ tipo: 'error', mensaje: m }), []);

  // Al cerrarse la ventana de login del proveedor se repite la última búsqueda con la sesión nueva.
  useEffect(
    () =>
      alCerrarLogin(id, () => {
        if (ultima.current) void buscar(ultima.current);
      }),
    [id, buscar],
  );

  return { estado, buscar, accion, mostrarError, ultima: ultima.current };
}
