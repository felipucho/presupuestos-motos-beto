import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lista de colores como chips: Enter o coma agrega, Backspace en vacío borra el último. */
export function ColoresInput({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const [texto, setTexto] = useState('');
  /** Agrega como chips los colores separados por coma (también si se pega una lista); deja lo que sigue a la última coma. */
  const agregar = (t: string, cerrar: boolean) => {
    const partes = t.split(',');
    const resto = cerrar ? '' : (partes.pop() ?? '');
    const nuevos = [...value];
    for (const c of partes.map((x) => x.trim()).filter(Boolean)) {
      if (!nuevos.some((v) => v.toLocaleLowerCase('es') === c.toLocaleLowerCase('es'))) nuevos.push(c);
    }
    if (nuevos.length !== value.length) onChange(nuevos);
    setTexto(resto);
  };
  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-papel-alto px-2 py-1.5 transition-[border-color,box-shadow] duration-150',
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20',
      )}
    >
      {value.map((c) => (
        <span key={c} className="inline-flex h-6 items-center gap-1 rounded-md bg-gris-claro pr-1 pl-2 text-xs font-medium text-tinta">
          {c}
          <button
            type="button"
            aria-label={`Quitar ${c}`}
            onClick={() => onChange(value.filter((v) => v !== c))}
            className="grid size-4 place-items-center rounded text-tinta-gris transition-colors hover:bg-gris-plano hover:text-tinta"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={texto}
        onChange={(e) => agregar(e.target.value, false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            agregar(texto, true);
          } else if (e.key === 'Backspace' && !texto && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => agregar(texto, true)}
        placeholder={value.length ? 'Agregar otro…' : 'Escribí un color y Enter'}
        className="h-6 min-w-28 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-tinta-gris/80"
      />
    </div>
  );

}
