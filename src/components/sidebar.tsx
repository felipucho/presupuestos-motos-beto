import { useState } from 'react';
import { ChartColumnBig, FilePlus2, PanelLeftClose, PanelLeftOpen, Settings2, type LucideIcon } from 'lucide-react';
import logoPapel from '@/assets/marca/motos-beto-papel.png';
import { cn } from '@/lib/utils';

export type Pantalla = 'nuevo' | 'historial' | 'config';

const ITEMS: { id: Pantalla; label: string; icono: LucideIcon }[] = [
  { id: 'nuevo', label: 'Nuevo presupuesto', icono: FilePlus2 },
  { id: 'historial', label: 'Métricas', icono: ChartColumnBig },
  { id: 'config', label: 'Configuración', icono: Settings2 },
];

const CLAVE_PLEGADO = 'menu-plegado';

function leerPlegado() {
  try {
    return localStorage.getItem(CLAVE_PLEGADO) === '1';
  } catch {
    return false;
  }
}

export function Sidebar({ activa, onIr }: { activa: Pantalla; onIr: (p: Pantalla) => void }) {
  const [plegado, setPlegado] = useState(leerPlegado);
  const alternar = () => {
    setPlegado(!plegado);
    try {
      localStorage.setItem(CLAVE_PLEGADO, plegado ? '0' : '1');
    } catch {
      // Sin almacenamiento sólo se pierde la preferencia al reabrir.
    }
  };
  const BotonPlegar = plegado ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside className={cn('flex shrink-0 flex-col overflow-hidden bg-tinta text-papel-suave transition-[width] duration-200', plegado ? 'w-16' : 'w-60')}>
      <div className={cn('flex pt-4', plegado ? 'justify-center pb-4' : 'justify-end px-3 pb-1')}>
        <button
          type="button"
          onClick={alternar}
          aria-label={plegado ? 'Mostrar menú' : 'Esconder menú'}
          aria-expanded={!plegado}
          title={plegado ? 'Mostrar menú' : 'Esconder menú'}
          className="grid size-9 place-items-center rounded-lg text-papel-suave/80 transition-colors duration-150 outline-none hover:bg-papel-alto/[0.06] hover:text-papel-alto focus-visible:ring-2 focus-visible:ring-naranja-vivo/70"
        >
          <BotonPlegar className="size-[18px]" strokeWidth={1.9} />
        </button>
      </div>
      {!plegado && (
        <div className="px-5 pb-7">
          <img src={logoPapel} alt="Motos Beto" draggable={false} className="h-auto w-full object-contain" />
          <p className="mt-3 text-[11px] font-semibold tracking-[0.14em] text-papel-suave/80 uppercase">Presupuestos</p>
        </div>
      )}
      <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-3" aria-label="Secciones">
        {ITEMS.map(({ id, label, icono: Icono }) => {
          const on = activa === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onIr(id)}
              aria-current={on ? 'page' : undefined}
              aria-label={plegado ? label : undefined}
              title={plegado ? label : undefined}
              className={cn(
                'relative flex h-10 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-naranja-vivo/70',
                id === 'historial' && 'mt-auto',
                on ? 'bg-papel-alto/[0.07] text-papel-alto' : 'hover:bg-papel-alto/[0.04] hover:text-papel-alto',
              )}
            >
              <span
                aria-hidden
                className={cn('absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-naranja-vivo transition-opacity duration-150', on ? 'opacity-100' : 'opacity-0')}
              />
              <Icono className={cn('size-[18px] shrink-0', on && 'text-naranja-vivo')} strokeWidth={1.9} />
              {!plegado && label}
            </button>
          );
        })}
      </nav>
      {!plegado && (
        <div className="border-t border-papel-alto/[0.08] px-5 py-4 text-xs text-papel-suave/80">
          <span className="tabular">Versión {__APP_VERSION__}</span>
        </div>
      )}
    </aside>
  );
}
