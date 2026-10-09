import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar, type Pantalla } from '@/components/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { ConfigProvider } from '@/lib/config';
import { FiadosProvider } from '@/lib/fiados-store';
import { proveedor, type IdProveedor } from '@/lib/proveedores';
import { borradorVacio, NuevoPresupuesto, type Borrador } from '@/screens/NuevoPresupuesto';
import { Configuracion } from '@/screens/Configuracion';
import { Fiados } from '@/screens/Fiados';
import { Historial } from '@/screens/Historial';
import { Repuestos } from '@/screens/Repuestos';

export function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('nuevo');
  // El borrador vive acá para no perderlo al pasar por Configuración.
  const [borrador, setBorrador] = useState<Borrador>(borradorVacio);
  const [idProveedor, setIdProveedor] = useState<IdProveedor>('cba');

  useEffect(() => {
    // Sin el menú contextual del navegador (Recargar, Inspeccionar…), salvo en campos de texto.
    const menu = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement && e.target.closest('input, textarea'))) e.preventDefault();
    };
    window.addEventListener('contextmenu', menu);
    return () => window.removeEventListener('contextmenu', menu);
  }, []);

  // Una vista por pantalla: si falta una, TypeScript lo marca. Sumar una pantalla es sumar una línea acá y en Sidebar.
  const vistas: Record<Pantalla, ReactNode> = {
    nuevo: <NuevoPresupuesto borrador={borrador} setBorrador={setBorrador} irAConfig={() => setPantalla('config')} />,
    // key: al cambiar de proveedor la búsqueda arranca de cero.
    repuestos: <Repuestos key={idProveedor} proveedor={proveedor(idProveedor)} irAFiados={() => setPantalla('fiados')} irAConfig={() => setPantalla('config')} />,
    fiados: <Fiados irARepuestos={() => setPantalla('repuestos')} />,
    historial: <Historial />,
    config: <Configuracion />,
  };

  return (
    <FiadosProvider>
      <div className="flex h-full">
        <Sidebar
          activa={pantalla}
          onIr={setPantalla}
          proveedor={idProveedor}
          onProveedor={(id) => {
            setIdProveedor(id);
            setPantalla('repuestos');
          }}
        />
        <div className="min-w-0 flex-1">
          <ConfigProvider fallback={<div className="h-full" />}>{vistas[pantalla]}</ConfigProvider>
        </div>
        <Toaster position="top-right" offset={{ top: 20, right: 24 }} closeButton />
      </div>
    </FiadosProvider>
  );
}
