import type { ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function AccionesFila({ nombre, onEditar, onBorrar }: { nombre: string; onEditar: () => void; onBorrar: () => void }) {
  return (
    <div className="flex justify-end gap-0.5 opacity-70 transition-opacity duration-150 group-hover/fila:opacity-100 focus-within:opacity-100">
      <Button variant="ghost" size="icon-sm" aria-label={`Editar ${nombre}`} title="Editar" onClick={onEditar}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Borrar ${nombre}`} title="Borrar" onClick={onBorrar} className="hover:bg-error-suave hover:text-error">
        <Trash2 />
      </Button>
    </div>
  );
}

/** Confirmación para acciones destructivas. Abierto mientras `abierto` sea true. */
export function Confirmar(props: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  accion: string;
  onConfirmar: () => void;
  peligro?: boolean;
}) {
  return (
    <AlertDialog open={props.abierto} onOpenChange={(v) => !v && props.onCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="font-texto text-sm text-tinta-media">{props.children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={props.onConfirmar}
            className={props.peligro ? 'bg-error! hover:bg-error/88! focus-visible:ring-error/25!' : undefined}
          >
            {props.accion}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Encabezado de una sección de Configuración. */
export function EncabezadoSeccion({ titulo, descripcion, children }: { titulo: string; descripcion: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{titulo}</h2>
        <p className="mt-1 max-w-xl font-texto text-sm text-tinta-media">{descripcion}</p>
      </div>
      {children && <div className="flex shrink-0 gap-2">{children}</div>}
    </div>
  );
}
