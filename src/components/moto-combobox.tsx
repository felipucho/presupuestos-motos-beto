import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatoMoneda } from '@/lib/formato';
import type { Moto } from '@/lib/schema';
import { cn } from '@/lib/utils';

export const OTRA = 'otra';

/** Motos agrupadas por marca (sin distinguir mayúsculas), marcas y modelos en orden alfabético. */
export function agruparPorMarca(motos: readonly Moto[]): [string, Moto[]][] {
  const grupos = new Map<string, Moto[]>();
  for (const m of motos) {
    const k = m.marca.toLocaleLowerCase('es');
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  return [...grupos.values()]
    .map((ms): [string, Moto[]] => [ms[0]!.marca, ms.sort((a, b) => a.modelo.localeCompare(b.modelo, 'es', { numeric: true }))])
    .sort(([a], [b]) => a.localeCompare(b, 'es'));
}

export function MotoCombobox(props: { id: string; motos: readonly Moto[]; value: string | null; onChange: (v: string) => void; invalid?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const grupos = useMemo(() => agruparPorMarca(props.motos), [props.motos]);
  const elegida = props.motos.find((m) => m.id === props.value);
  const elegir = (v: string) => {
    props.onChange(v);
    setAbierto(false);
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          id={props.id}
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          aria-invalid={props.invalid || undefined}
          className="h-10 w-full justify-between px-3 font-normal"
        >
          {elegida ? (
            <span className="truncate">
              <span className="font-semibold">{elegida.marca}</span> {elegida.modelo}
              {elegida.cilindrada && <span className="text-tinta-gris"> · {elegida.cilindrada}</span>}
            </span>
          ) : props.value === OTRA ? (
            <span className="flex items-center gap-2 font-medium text-naranja">
              <PencilLine className="size-4" /> Otra moto (carga manual)
            </span>
          ) : (
            <span className="text-tinta-gris">Elegí una moto del catálogo…</span>
          )}
          <ChevronsUpDown className="size-4 text-tinta-gris" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[380px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por marca, modelo o cilindrada…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No hay motos que coincidan.</CommandEmpty>
            {grupos.map(([marca, motos]) => (
              <CommandGroup key={marca} heading={marca}>
                {motos.map((m) => (
                  <CommandItem key={m.id} value={`${m.marca} ${m.modelo} ${m.cilindrada} ${m.id}`} onSelect={() => elegir(m.id)} className="gap-3">
                    <Check className={cn('size-4 text-naranja', props.value === m.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 flex-1 truncate">
                      {m.modelo}
                      {m.cilindrada && <span className="text-tinta-gris"> · {m.cilindrada}</span>}
                    </span>
                    <span className="tabular text-xs text-tinta-media">{formatoMoneda(m.precioLista)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {grupos.length > 0 && <CommandSeparator />}
            <CommandGroup forceMount>
              <CommandItem forceMount value="otra moto manual" onSelect={() => elegir(OTRA)} className="gap-3 py-2.5 font-medium text-naranja data-selected:text-naranja-hondo">
                <PencilLine className="size-4 text-naranja" />
                Otra moto…
                <span className="ml-auto text-xs font-normal text-tinta-gris">Cargar a mano</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
