import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EstadoVacio({ icono: Icono, titulo, children, accion }: { icono: LucideIcon; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gris-plano px-6 py-10 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-gris-claro text-tinta-media">
        <Icono className="size-5" strokeWidth={1.75} />
      </div>
      <p className="font-semibold text-tinta">{titulo}</p>
      {children && <p className="mt-1 max-w-sm font-texto text-sm text-tinta-media">{children}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}
