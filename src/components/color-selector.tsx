import { useState, type KeyboardEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';

const NUEVO = '__nuevo__';

/**
 * Moto del catálogo (con onAgregar): lista de sus colores más «Agregar otro color…», que lo guarda en la moto.
 * Carga manual (sin onAgregar): texto libre.
 */
export function ColorSelector(props: { id: string; colores: string[]; value: string; onChange: (v: string) => void; onAgregar?: (color: string) => void }) {
  const { id, colores, value, onChange, onAgregar } = props;
  const [agregando, setAgregando] = useState(colores.length === 0);
  const [nuevo, setNuevo] = useState('');

  if (!onAgregar) return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10" />;

  const confirmar = () => {
    const c = nuevo.trim();
    if (!c) return;
    const existente = colores.find((x) => x.toLocaleLowerCase('es') === c.toLocaleLowerCase('es'));
    if (existente) onChange(existente);
    else onAgregar(c);
    setNuevo('');
    setAgregando(false);
  };

  if (agregando) {
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmar();
      } else if (e.key === 'Escape' && colores.length > 0) {
        e.stopPropagation();
        setAgregando(false);
      }
    };
    return (
      <div className="flex gap-1.5">
        <Input id={id} value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={teclas} placeholder="Nuevo color" className="h-10" autoFocus={colores.length > 0} />
        <Button type="button" size="icon" className="size-10 shrink-0" onClick={confirmar} disabled={!nuevo.trim()} aria-label="Agregar color" title="Agregar a la moto">
          <Check />
        </Button>
        {colores.length > 0 && (
          <Button type="button" variant="outline" size="icon" className="size-10 shrink-0" onClick={() => setAgregando(false)} aria-label="Cancelar" title="Cancelar">
            <X />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select value={colores.includes(value) ? value : undefined} onValueChange={(v) => (v === NUEVO ? setAgregando(true) : onChange(v))}>
      <SelectTrigger id={id} className="w-full data-[size=default]:h-10">
        <SelectValue placeholder="Elegí un color" />
      </SelectTrigger>
      <SelectContent>
        {colores.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={NUEVO} className="text-naranja">
          <Plus className="text-naranja" /> Agregar otro color…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
