import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { cargarConfig, guardarConfig } from './storage';
import type { Config } from './schema';

type Actualizar = (cambio: (c: Config) => Config, mensaje?: string | false) => void;

interface Ctx {
  config: Config;
  actualizar: Actualizar;
  reemplazar: (c: Config) => void;
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

  const persistir = useCallback((c: Config, mensaje: string | false) => {
    cola.current = cola.current
      .then(() => guardarConfig(c))
      .then(() => {
        if (mensaje) toast.success(mensaje);
      })
      .catch((e: unknown) => {
        toast.error('No se pudo guardar la configuración', { description: String(e), duration: Infinity });
      });
  }, []);

  const actualizar = useCallback<Actualizar>(
    (cambio, mensaje = 'Configuración guardada') => {
      const prev = actual.current;
      if (!prev) return;
      const next = cambio(prev);
      if (next === prev) return;
      actual.current = next;
      setConfig(next);
      persistir(next, mensaje);
    },
    [persistir],
  );

  const reemplazar = useCallback((c: Config) => actualizar(() => c, 'Configuración importada'), [actualizar]);

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
  if (!config) return fallback;
  return <ConfigCtx.Provider value={{ config, actualizar, reemplazar }}>{children}</ConfigCtx.Provider>;
}
