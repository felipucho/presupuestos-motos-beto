import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { formatoMoneda, formatoNumero, parsearDecimal, parsearPesos } from '@/lib/formato';
import { cn } from '@/lib/utils';

type Base = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'>;

/** Pesos enteros con formato "$ 1.234.567" mientras se escribe; conserva el cursor entre los dígitos. */
export function InputDinero({ value, onValueChange, className, onKeyDown, ...props }: Base & { value: number | null; onValueChange: (v: number | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const digitosAntesDelCursor = useRef<number | null>(null);
  const texto = value === null ? '' : formatoMoneda(value);

  useLayoutEffect(() => {
    const el = ref.current;
    const n = digitosAntesDelCursor.current;
    if (!el || n === null || document.activeElement !== el) return;
    digitosAntesDelCursor.current = null;
    let pos = 0;
    for (let vistos = 0; pos < texto.length && vistos < n; pos++) if (/\d/.test(texto[pos]!)) vistos++;
    if (n === 0) pos = texto.search(/\d/) === -1 ? texto.length : texto.search(/\d/);
    el.setSelectionRange(pos, pos);
  }, [texto]);

  return (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      placeholder="$ 0"
      className={cn('tabular text-right', className)}
      value={texto}
      onChange={(e) => {
        const caret = e.target.selectionStart ?? e.target.value.length;
        digitosAntesDelCursor.current = e.target.value.slice(0, caret).replace(/\D/g, '').length;
        onValueChange(parsearPesos(e.target.value));
      }}
      onKeyDown={(e) => {
        // Pesos enteros: la coma no se vería y los dígitos de después pasarían a ser pesos (1234,5 → 12.345).
        if (e.key === ',') e.preventDefault();
        onKeyDown?.(e);
      }}
      {...props}
    />
  );
}

const aTexto = (n: number) => (Number.isNaN(n) ? '' : formatoNumero(n).replace(/\./g, ''));

/**
 * Número decimal (acepta coma). Mientras se edita conserva lo tipeado y avisa el número parseado:
 * NaN si no es un número, para que el formulario muestre el error.
 */
export function InputNumero({ value, onValueChange, sufijo, className, onFocus, onBlur, ...props }: Base & { value: number; onValueChange: (v: number) => void; sufijo?: string }) {
  const [editando, setEditando] = useState<string | null>(null);
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        autoComplete="off"
        className={cn('tabular text-right', sufijo && 'pr-8', className)}
        value={editando ?? aTexto(value)}
        onFocus={(e) => {
          setEditando(aTexto(value));
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setEditando(null);
          onBlur?.(e);
        }}
        onChange={(e) => {
          setEditando(e.target.value);
          onValueChange(parsearDecimal(e.target.value));
        }}
        {...props}
      />
      {sufijo && <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-tinta-gris">{sufijo}</span>}
    </div>
  );
}
