import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EncabezadoSeccion } from '@/components/acciones';
import { Campo } from '@/components/campo';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfig } from '@/lib/config';
import { enTauri } from '@/lib/entorno';
import { listarImpresoras } from '@/pdf/imprimir';

// Radix no admite un valor vacío en un SelectItem: este valor representa «sin impresora elegida».
const PREDETERMINADA = '__predeterminada__';

export function Impresora() {
  const { config, actualizar } = useConfig();
  const [impresoras, setImpresoras] = useState<string[]>([]);
  const elegida = config.local.impresora;

  useEffect(() => {
    if (enTauri) listarImpresoras().then(setImpresoras).catch((e: unknown) => toast.error('No se pudo leer la lista de impresoras', { description: String(e) }));
  }, []);

  // Si la impresora guardada no aparece (otra PC, o está apagada), igual se muestra para no perder la elección.
  const opciones = elegida && !impresoras.includes(elegida) ? [elegida, ...impresoras] : impresoras;

  // Guarda sólo este campo: no depende de que el resto de Datos del local esté completo y válido.
  const elegir = (v: string) => actualizar((c) => ({ ...c, local: { ...c.local, impresora: v === PREDETERMINADA ? null : v } }), 'Impresora guardada');

  return (
    <>
      <EncabezadoSeccion titulo="Impresora" descripcion="Los presupuestos se imprimen en la impresora que elijas acá. Se guarda al elegirla." />
      <Card>
        <CardContent className="px-5">
          <Campo id="impresora" label="Impresora para imprimir los presupuestos" ayuda="Si no elegís una, se usa la predeterminada de Windows.">
            <Select value={elegida ?? PREDETERMINADA} onValueChange={elegir}>
              <SelectTrigger id="impresora" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PREDETERMINADA}>Predeterminada de Windows</SelectItem>
                {opciones.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </CardContent>
      </Card>
    </>
  );
}
