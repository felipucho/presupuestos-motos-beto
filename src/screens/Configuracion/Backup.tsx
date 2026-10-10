import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { Confirmar, EncabezadoSeccion } from '@/components/acciones';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { copiaAntesDeImportar, exportarBackup, leerBackup, type Backup as Datos, type Importado } from '@/lib/backup';
import { useConfig } from '@/lib/config';
import { diaDe, resumen, type Fiados } from '@/lib/fiados';
import { useFiados } from '@/lib/fiados-store';
import { formatoCentavos } from '@/lib/formato';
import { cargarHistorial, reemplazarHistorial, type Registro } from '@/lib/historial';
import type { Config } from '@/lib/schema';
import { enTauri } from '@/lib/entorno';

const n = (cant: number, uno: string, varios: string) => `${cant} ${cant === 1 ? uno : varios}`;

const contar = (c: Config) =>
  `${n(c.vendedores.length, 'vendedor', 'vendedores')}, ${n(c.motos.length, 'moto', 'motos')}, ${n(c.planesTarjeta.length, 'plan', 'planes')} de tarjeta y ${n(c.gastos.length, 'gasto', 'gastos')}`;

const contarHistorial = (h: Registro[]) => n(h.length, 'presupuesto', 'presupuestos');

const contarFiados = (f: Fiados) =>
  `${n(f.clientes.length, 'cliente', 'clientes')} de fiado con ${formatoCentavos(resumen(f, diaDe(new Date())).aCobrar)} a cobrar`;

export function Backup() {
  const { config, reemplazar } = useConfig();
  const fiadosCtx = useFiados();
  const [importado, setImportado] = useState<Importado | null>(null);

  const actual = async (): Promise<Datos> => {
    if (!fiadosCtx.fiados) throw new Error('Los fiados todavía no se cargaron.');
    return { config, historial: (await cargarHistorial()).registros, fiados: fiadosCtx.fiados };
  };

  const exportar = async () => {
    if (!enTauri) return toast.info('Disponible sólo en la app de escritorio');
    try {
      const ruta = await exportarBackup(await actual());
      if (ruta) toast.success('Backup exportado', { description: ruta });
    } catch (e) {
      toast.error('No se pudo exportar', { description: String(e) });
    }
  };

  const aplicar = async (i: Importado) => {
    let antes: Datos | null = null;
    let copia = '';
    try {
      // Antes de pisar nada, una copia de lo que hay: si el archivo era el equivocado, se recupera de ahí.
      antes = await actual();
      copia = await copiaAntesDeImportar(antes);
      // La carpeta de PDFs y la impresora son de esta computadora: no se traen de otra.
      if (i.config) await reemplazar({ ...i.config, local: { ...i.config.local, carpetaPdf: config.local.carpetaPdf, impresora: config.local.impresora } });
      if (i.historial) await reemplazarHistorial(i.historial);
      if (i.fiados) await fiadosCtx.reemplazar(i.fiados);
      toast.success('Backup importado', { description: `Lo que había antes quedó guardado en ${copia}`, duration: 15000 });
    } catch (e) {
      // Si falló a mitad, se vuelve a lo de antes para no quedar con datos mezclados.
      let vuelta = '';
      if (antes) {
        try {
          await reemplazar(antes.config);
          await reemplazarHistorial(antes.historial);
          await fiadosCtx.reemplazar(antes.fiados);
          vuelta = ' No se cambió nada: quedó todo como estaba.';
        } catch {
          vuelta = ' No se pudo volver a lo de antes: cerrá la app e importá esa copia.';
        }
      }
      const enCopia = copia ? ` Lo que había antes quedó guardado en ${copia}.` : '';
      toast.error('No se pudo importar', { description: `${String(e).replace(/\.$/, '')}.${vuelta}${enCopia}`, duration: Infinity });
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
        descripcion="Guardá todo (configuración, historial de presupuestos y fiados) en un archivo, para tener una copia o pasarla a otra computadora. Además, todo se copia solo cada día en Documentos\Presupuestos Motos Beto\copias (una copia por día del mes), y esas copias también se pueden importar acá."
      />
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="grid gap-4 px-5">
            <div className="grid size-10 place-items-center rounded-lg bg-gris-claro text-tinta-media">
              <Download className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold">Exportar</h3>
              <p className="mt-1 font-texto text-sm text-tinta-media">
                Hoy se exportarían {contar(config)}, el historial de presupuestos{fiadosCtx.fiados && ` y ${contarFiados(fiadosCtx.fiados)}`}.
              </p>
            </div>
            <Button className="justify-self-start" onClick={() => void exportar()}>
              <Download /> Exportar backup…
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
              <p className="mt-1 font-texto text-sm text-tinta-media">Reemplaza lo actual por lo de un archivo exportado antes. Se pide confirmación y antes se guarda una copia de lo que hay.</p>
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
        titulo="¿Reemplazar con el backup?"
        accion="Reemplazar"
        peligro
        onConfirmar={() => importado && void aplicar(importado)}
      >
        {importado && (
          <>
            <p>
              {importado.config ? (
                <>
                  El archivo es del local «{importado.config.local.nombre}» y trae <b>{contar(importado.config)}</b>
                </>
              ) : (
                <>Es una copia de sólo fiados</>
              )}
              {importado.historial && (
                <>
                  , <b>{contarHistorial(importado.historial)}</b>
                </>
              )}
              {importado.fiados && (
                <>
                  {importado.config ? ' y' : ' con'} <b>{contarFiados(importado.fiados)}</b>
                </>
              )}
              .
            </p>
            {!importado.config ? (
              <p className="mt-2">
                Se reemplazan <b>todos los fiados</b>; la configuración y el historial no se tocan. Lo que hay ahora
                {fiadosCtx.fiados && ` (${contarFiados(fiadosCtx.fiados)})`} se guarda antes en una copia.
              </p>
            ) : importado.fiados ? (
              <p className="mt-2">
                Se reemplazan la configuración, el historial y <b>todos los fiados</b>. Lo que hay ahora{fiadosCtx.fiados && ` (${contarFiados(fiadosCtx.fiados)})`} se
                guarda antes en una copia.
              </p>
            ) : (
              <p className="mt-2">Es un backup viejo, sólo de configuración: se reemplaza la configuración ({contar(config)}). El historial y los fiados no se tocan.</p>
            )}
          </>
        )}
      </Confirmar>
    </>
  );
}
