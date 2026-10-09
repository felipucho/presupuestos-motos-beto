import { useState } from 'react';
import { Bike, CreditCard, DatabaseBackup, Receipt, Store, UsersRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Backup } from './Backup';
import { Catalogo } from './Catalogo';
import { DatosLocal } from './DatosLocal';
import { Gastos } from './Gastos';
import { Pagos } from './Pagos';
import { Vendedores } from './Vendedores';

type Seccion = 'local' | 'vendedores' | 'pagos' | 'gastos' | 'catalogo' | 'backup';

const SECCIONES: { id: Seccion; label: string; icono: LucideIcon }[] = [
  { id: 'local', label: 'Datos del local', icono: Store },
  { id: 'vendedores', label: 'Vendedores', icono: UsersRound },
  { id: 'pagos', label: 'Pagos', icono: CreditCard },
  { id: 'gastos', label: 'Gastos', icono: Receipt },
  { id: 'catalogo', label: 'Catálogo', icono: Bike },
  { id: 'backup', label: 'Backup', icono: DatabaseBackup },
];

export function Configuracion() {
  const [seccion, setSeccion] = useState<Seccion>('local');
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-8 pt-7 pb-5">
        <h1 className="text-[22px] font-bold tracking-tight">Configuración</h1>
        <p className="mt-0.5 text-sm text-tinta-gris">Los cambios se guardan automáticamente en esta computadora.</p>
      </header>
      <div className="flex min-h-0 flex-1 gap-8 px-8">
        <nav className="w-48 shrink-0" aria-label="Secciones de configuración">
          <ul className="grid gap-0.5">
            {SECCIONES.map(({ id, label, icono: Icono }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSeccion(id)}
                  aria-current={seccion === id ? 'page' : undefined}
                  className={cn(
                    'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
                    seccion === id ? 'bg-papel-alto font-semibold text-tinta ring-1 ring-gris-plano' : 'text-tinta-media hover:bg-gris-claro/70 hover:text-tinta',
                  )}
                >
                  <Icono className={cn('size-4', seccion === id ? 'text-naranja' : 'text-tinta-gris')} />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main key={seccion} className="min-w-0 flex-1 animate-in overflow-y-auto pr-1 pb-10 duration-200 fade-in-0">
          <div className="max-w-4xl">
            {seccion === 'local' && <DatosLocal />}
            {seccion === 'vendedores' && <Vendedores />}
            {seccion === 'pagos' && <Pagos />}
            {seccion === 'gastos' && <Gastos />}
            {seccion === 'catalogo' && <Catalogo />}
            {seccion === 'backup' && <Backup />}
          </div>
        </main>
      </div>
    </div>
  );
}
