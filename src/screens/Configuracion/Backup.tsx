import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { Confirmar, EncabezadoSeccion } from '@/components/acciones';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfig } from '@/lib/config';
import type { Config } from '@/lib/schema';
import { enTauri, exportarConfig, leerBackup } from '@/lib/storage';

const contar = (c: Config) =>
  `${c.vendedores.length} ${c.vendedores.length === 1 ? 'vendedor' : 'vendedores'}, ${c.motos.length} ${c.motos.length === 1 ? 'moto' : 'motos'}, ${c.planesTarjeta.length} ${c.planesTarjeta.length === 1 ? 'plan' : 'planes'} de tarjeta y ${c.gastos.length} ${c.gastos.length === 1 ? 'gasto' : 'gastos'}`;

export function Backup() {
  const { config, reemplazar } = useConfig();
  const [importado, setImportado] = useState<Config | null>(null);

  const exportar = async () => {
    if (!enTauri) return toast.info('Disponible sólo en la app de escritorio');
    try {
      const ruta = await exportarConfig(config);
      if (ruta) toast.success('Configuración exportada', { description: ruta });
    } catch (e) {
      toast.error('No se pudo exportar', { description: String(e) });
    }
  };

  const importar = async () => {
    if (!enTauri) return toast.info('Disponible sólo en la app de escritorio');
    try {
      const c = await leerBackup();
      if (c) setImportado(c);
    } catch (e) {
      toast.error('No se pudo importar el archivo', { description: e instanceof Error ? e.message : String(e), duration: 10000 });
    }
  };

  return (
    <>
      <EncabezadoSeccion
        titulo="Backup"
        descripcion="Guardá toda la configuración (datos del local, pagos, gastos y catálogo) en un archivo, para tener una copia o pasarla a otra computadora."
      />
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="grid gap-4 px-5">
            <div className="grid size-10 place-items-center rounded-lg bg-gris-claro text-tinta-media">
              <Download className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold">Exportar</h3>
              <p className="mt-1 font-texto text-sm text-tinta-media">Hoy se exportarían {contar(config)}.</p>
            </div>
            <Button className="justify-self-start" onClick={() => void exportar()}>
              <Download /> Exportar configuración…
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-4 px-5">
            <div className="grid size-10 place-items-center rounded-lg bg-gris-claro text-tinta-media">
              <Upload className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold">Importar</h3>
              <p className="mt-1 font-texto text-sm text-tinta-media">Reemplaza toda la configuración actual por la de un archivo exportado antes. Se pide confirmación.</p>
            </div>
            <Button variant="outline" className="justify-self-start" onClick={() => void importar()}>
              <Upload /> Importar desde archivo…
            </Button>
          </CardContent>
        </Card>
      </div>

      <Confirmar
        abierto={importado !== null}
        onCerrar={() => setImportado(null)}
        titulo="¿Reemplazar la configuración?"
        accion="Reemplazar"
        peligro
        onConfirmar={() => importado && reemplazar(importado)}
      >
        <p>
          El archivo trae <b>{importado && contar(importado)}</b>, del local «{importado?.local.nombre}».
        </p>
        <p className="mt-2">Lo que hay ahora ({contar(config)}) se va a perder. Si no estás seguro, exportá primero una copia.</p>
      </Confirmar>
    </>
  );
}
