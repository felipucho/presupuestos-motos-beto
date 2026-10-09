import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Label + control + ayuda o error inline debajo. */
export function Campo(props: { id: string; label: ReactNode; error?: string; ayuda?: ReactNode; className?: string; opcional?: boolean; children: ReactNode }) {
  return (
    <div className={cn('grid content-start gap-1.5', props.className)}>
      <Label htmlFor={props.id} className="text-[13px] font-medium text-tinta-media">
        {props.label}
        {props.opcional && <span className="font-normal text-tinta-gris">(opcional)</span>}
      </Label>
      {props.children}
      {props.error ? (
        <p id={`${props.id}-error`} role="alert" className="animate-in fade-in-0 slide-in-from-top-0.5 text-xs font-medium text-error duration-150">
          {props.error}
        </p>
      ) : props.ayuda ? (
        <p className="text-xs text-tinta-gris">{props.ayuda}</p>
      ) : null}
    </div>
  );
}

export const invalido = (id: string, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};
