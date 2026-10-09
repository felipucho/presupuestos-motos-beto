import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { cargarConfig, guardarConfig } from './config-store';
import type { Config } from './schema';

type Actualizar = (cambio: (c: Config) => Config, mensaje?: string | false) => void;

interface Ctx {
  config: Config;
  actualizar: Actualizar;
  /** Reemplaza toda la configuración y espera a que quede escrita: la promesa falla si el disco falla. */
  reemplazar: (c: Config) => Promise<void>;
}

const ConfigCtx = createContext<Ctx | null>(null);

export function useConfig(): Ctx {
  const c = useContext(ConfigCtx);
  if (!c) throw new Error('useConfig fuera de ConfigProvider');
  return c;
}

export function ConfigProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Serializa las escrituras: cada guardado espera al anterior, así nunca gana uno viejo.
  const cola = useRef(Promise.resolve());
  const actual = useRef<Config | null>(null);

  useEffect(() => {
    cargarConfig()
      .then(({ config, aviso }) => {
        actual.current = config;
        setConfig(config);
        if (aviso) toast.error('Configuración dañada', { description: aviso, duration: Infinity });
      })
      .catch((e: unknown) => setErrorCarga(String(e)));
  }, []);

  const escribir = useCallback((c: Config) => {
    const p = cola.current.then(() => guardarConfig(c));
    cola.current = p.catch(() => undefined);
    return p;
  }, []);

  const actualizar = useCallback<Actualizar>(
    (cambio, mensaje = 'Configuración guardada') => {
      const prev = actual.current;
      if (!prev) return;
      const next = cambio(prev);
      if (next === prev) return;
      actual.current = next;
      setConfig(next);
      escribir(next)
        .then(() => {
          if (mensaje) toast.success(mensaje);
        })
        .catch((e: unknown) => {
          toast.error('No se pudo guardar la configuración', { description: String(e), duration: Infinity });
        });
    },
    [escribir],
  );

  const reemplazar = useCallback<Ctx['reemplazar']>(
    (c) => {
      actual.current = c;
      setConfig(c);
      return escribir(c);
    },
    [escribir],
  );

  const value = useMemo(() => (config ? { config, actualizar, reemplazar } : null), [config, actualizar, reemplazar]);

  if (errorCarga) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-md">
          <p className="font-semibold text-error">No se pudo abrir la configuración</p>
          <p className="mt-2 text-sm text-tinta-media">{errorCarga}</p>
        </div>
      </div>
    );
  }
  if (!value) return fallback;
  return <ConfigCtx.Provider value={value}>{children}</ConfigCtx.Provider>;
}
