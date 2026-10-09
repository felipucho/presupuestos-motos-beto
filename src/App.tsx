import { useEffect, useState } from 'react';
import { Sidebar, type Pantalla } from '@/components/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { ConfigProvider } from '@/lib/config';
import { FiadosProvider } from '@/lib/fiados-store';
import { borradorVacio, NuevoPresupuesto, type Borrador } from '@/screens/NuevoPresupuesto';
import { Configuracion } from '@/screens/Configuracion';
import { Fiados } from '@/screens/Fiados';
import { Historial } from '@/screens/Historial';
import { Repuestos } from '@/screens/Repuestos';

export function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('nuevo');
  // El borrador vive acá para no perderlo al pasar por Configuración.
  const [borrador, setBorrador] = useState<Borrador>(borradorVacio);

  useEffect(() => {
    // Sin el menú contextual del navegador (Recargar, Inspeccionar…), salvo en campos de texto.
    const menu = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement && e.target.closest('input, textarea'))) e.preventDefault();
    };
    window.addEventListener('contextmenu', menu);
    return () => window.removeEventListener('contextmenu', menu);
  }, []);

  return (
    <FiadosProvider>
      <div className="flex h-full">
        <Sidebar activa={pantalla} onIr={setPantalla} />
        <div className="min-w-0 flex-1">
          <ConfigProvider fallback={<div className="h-full" />}>
            {pantalla === 'nuevo' ? (
              <NuevoPresupuesto borrador={borrador} setBorrador={setBorrador} irAConfig={() => setPantalla('config')} />
            ) : pantalla === 'repuestos' ? (
              <Repuestos irAFiados={() => setPantalla('fiados')} />
            ) : pantalla === 'fiados' ? (
              <Fiados irARepuestos={() => setPantalla('repuestos')} />
            ) : pantalla === 'historial' ? (
              <Historial />
            ) : (
              <Configuracion />
            )}
          </ConfigProvider>
        </div>
        <Toaster position="top-right" offset={{ top: 20, right: 24 }} closeButton />
      </div>
    </FiadosProvider>
  );
}
