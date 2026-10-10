import { useEffect, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { EncabezadoSeccion } from '@/components/acciones';
import { Campo, invalido } from '@/components/campo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useConfig } from '@/lib/config';
import { erroresPorCampo, localSchema, type Local } from '@/lib/schema';
import { carpetaPorDefecto, elegirCarpeta } from '@/lib/archivos';
import { enTauri } from '@/lib/entorno';
import { listarImpresoras } from '@/pdf/imprimir';

type Texto = Exclude<keyof Local, 'carpetaPdf' | 'impresora'>;
// Radix no admite un valor vacío en un SelectItem: este valor representa «sin impresora elegida».
const PREDETERMINADA = '__predeterminada__';

export function DatosLocal() {
  const { config, actualizar } = useConfig();
  const [d, setD] = useState<Local>(config.local);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [porDefecto, setPorDefecto] = useState('');
  const [impresoras, setImpresoras] = useState<string[]>([]);

  useEffect(() => {
    if (enTauri) void carpetaPorDefecto().then(setPorDefecto).catch(() => setPorDefecto(''));
    if (enTauri) listarImpresoras().then(setImpresoras).catch((e: unknown) => toast.error('No se pudo leer la lista de impresoras', { description: String(e) }));
  }, []);
  // Si cambia desde afuera (p. ej. al importar un backup), se refleja acá.
  useEffect(() => setD(config.local), [config.local]);

  /** Guarda al salir del campo si todo es válido; si no, muestra el error y no pisa lo guardado. */
  const guardar = (next: Local = d) => {
    const r = localSchema.safeParse(next);
    if (!r.success) return setErrores(erroresPorCampo(r.error));
    setErrores({});
    if (JSON.stringify(r.data) !== JSON.stringify(config.local)) actualizar((c) => ({ ...c, local: r.data }));
  };

  const texto = (k: Texto, extra: { inputMode?: 'tel'; placeholder?: string; maxLength?: number; className?: string } = {}) => ({
    id: k,
    value: d[k],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: k === 'prefijo' ? e.target.value.toUpperCase() : e.target.value }),
    onBlur: () => guardar(),
    ...invalido(k, errores[k]),
    ...extra,
  });

  const cambiarCarpeta = async () => {
    try {
      const c = await elegirCarpeta(d.carpetaPdf ?? porDefecto);
      if (c) guardar({ ...d, carpetaPdf: c });
    } catch (e) {
      toast.error('No se pudo elegir la carpeta', { description: String(e) });
    }
  };

  // Si la impresora guardada no aparece (otra PC, o está apagada), igual se muestra para no perder la elección.
  const opciones = d.impresora && !impresoras.includes(d.impresora) ? [d.impresora, ...impresoras] : impresoras;

  return (
    <>
      <EncabezadoSeccion titulo="Datos del local" descripcion="Aparecen en el encabezado y el pie de cada presupuesto. El logo y los colores son los de la marca y vienen fijos." />
      <div className="grid gap-4">
        <Card>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-4 px-5">
            <Campo id="nombre" label="Nombre del local" error={errores.nombre}>
              <Input {...texto('nombre')} />
            </Campo>
            <Campo id="direccion" label="Dirección" error={errores.direccion}>
              <Input {...texto('direccion')} />
            </Campo>
            <Campo id="telefono" label="Teléfono" opcional>
              <Input {...texto('telefono', { inputMode: 'tel' })} />
            </Campo>
            <Campo id="whatsapp" label="WhatsApp" opcional>
              <Input {...texto('whatsapp', { inputMode: 'tel' })} />
            </Campo>
            <Campo id="instagram" label="Instagram" opcional ayuda="Con o sin @.">
              <Input {...texto('instagram', { placeholder: '@motosbeto' })} />
            </Campo>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-4 px-5">
            <Campo id="prefijo" label="Prefijo del número de presupuesto" error={errores.prefijo} ayuda={`Ej.: ${d.prefijo || 'MB'}-20261008-203412`}>
              <Input {...texto('prefijo', { maxLength: 8, className: 'uppercase tabular' })} />
            </Campo>
            <Campo id="validez" label="Validez del presupuesto" ayuda="Fija: hasta el último día del mes en que se emite.">
              <div id="validez" className="flex h-9 items-center rounded-lg border border-gris-plano bg-gris-claro/60 px-3 text-sm text-tinta-media">
                Hasta fin de mes
              </div>
            </Campo>
            <Campo id="textoLegal" label="Texto legal del pie" className="col-span-2" opcional>
              <Textarea {...texto('textoLegal')} className="min-h-16" />
            </Campo>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-5">
            <Campo id="carpeta" label="Carpeta donde se guardan los PDF" ayuda="Es la que se propone al guardar; en el momento se puede elegir otra.">
              <div className="flex items-center gap-2">
                <div id="carpeta" className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-gris-plano bg-gris-claro/60 px-3 text-sm text-tinta-media">
                  <span className="truncate" title={d.carpetaPdf ?? porDefecto}>
                    {d.carpetaPdf ?? (porDefecto || 'Documentos\\Presupuestos Motos Beto')}
                  </span>
                </div>
                <Button variant="outline" onClick={() => void cambiarCarpeta()}>
                  <FolderOpen /> Elegir…
                </Button>
                {d.carpetaPdf !== null && (
                  <Button variant="ghost" onClick={() => guardar({ ...d, carpetaPdf: null })} title="Volver a Documentos\Presupuestos Motos Beto">
                    <RotateCcw /> Restablecer
                  </Button>
                )}
              </div>
            </Campo>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-5">
            <Campo id="impresora" label="Impresora para imprimir los presupuestos" ayuda="Si no elegís una, se usa la predeterminada de Windows.">
              <Select value={d.impresora ?? PREDETERMINADA} onValueChange={(v) => guardar({ ...d, impresora: v === PREDETERMINADA ? null : v })}>
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
      </div>
    </>
  );
}
