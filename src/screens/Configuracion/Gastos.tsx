import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Receipt } from 'lucide-react';
import { AccionesFila, Confirmar, EncabezadoSeccion } from '@/components/acciones';
import { Campo, invalido } from '@/components/campo';
import { EstadoVacio } from '@/components/estado-vacio';
import { InputDinero } from '@/components/inputs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfig } from '@/lib/config';
import { quitarPor, upsertPor } from '@/lib/listas';
import { formatoMoneda } from '@/lib/formato';
import { erroresPorCampo, gastoSchema, nuevoId, type Gasto } from '@/lib/schema';

export function Gastos() {
  const { config, actualizar } = useConfig();
  const [editando, setEditando] = useState<Gasto | 'nuevo' | null>(null);
  const [borrando, setBorrando] = useState<Gasto | null>(null);
  const total = config.gastos.reduce((a, g) => a + g.monto, 0);

  return (
    <>
      <EncabezadoSeccion titulo="Gastos adicionales" descripcion="Montos fijos que se suman al precio de cualquier moto, como flete o formularios. En cada presupuesto se elige cuáles incluir. El patentamiento se carga en cada moto del catálogo.">
        {config.gastos.length > 0 && (
          <Button onClick={() => setEditando('nuevo')}>
            <Plus /> Agregar gasto
          </Button>
        )}
      </EncabezadoSeccion>
      <Card className="py-2">
        <CardContent className="px-3">
          {config.gastos.length === 0 ? (
            <div className="py-3">
              <EstadoVacio
                icono={Receipt}
                titulo="Sin gastos cargados"
                accion={
                  <Button onClick={() => setEditando('nuevo')}>
                    <Plus /> Agregar el primer gasto
                  </Button>
                }
              >
                Por ejemplo: Flete o Formularios, cada uno con su monto en pesos.
              </EstadoVacio>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gasto</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.gastos.map((g) => (
                  <TableRow key={g.id} className="group/fila">
                    <TableCell className="font-medium">{g.nombre}</TableCell>
                    <TableCell className="tabular text-right">{formatoMoneda(g.monto)}</TableCell>
                    <TableCell>
                      <AccionesFila nombre={g.nombre} onEditar={() => setEditando(g)} onBorrar={() => setBorrando(g)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-transparent">
                <TableRow className="hover:bg-transparent">
                  <TableCell className="text-tinta-media">Total si se incluyen todos</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatoMoneda(total)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <GastoDialog
        gasto={editando}
        onCerrar={() => setEditando(null)}
        onGuardar={(g) => {
          const existe = config.gastos.some((x) => x.id === g.id);
          actualizar((c) => ({ ...c, gastos: upsertPor(c.gastos, g) }), existe ? 'Gasto actualizado' : 'Gasto agregado');
          setEditando(null);
        }}
      />
      <Confirmar
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo="¿Borrar este gasto?"
        accion="Borrar gasto"
        peligro
        onConfirmar={() => borrando && actualizar((c) => ({ ...c, gastos: quitarPor(c.gastos, borrando.id) }), 'Gasto borrado')}
      >
        Se va a quitar <b>{borrando?.nombre}</b> de la lista de gastos.
      </Confirmar>
    </>
  );
}

function GastoDialog(props: { gasto: Gasto | 'nuevo' | null; onCerrar: () => void; onGuardar: (g: Gasto) => void }) {
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const id = props.gasto && props.gasto !== 'nuevo' ? props.gasto.id : null;

  useEffect(() => {
    if (!props.gasto) return;
    setNombre(props.gasto === 'nuevo' ? '' : props.gasto.nombre);
    setMonto(props.gasto === 'nuevo' ? null : props.gasto.monto);
    setErrores({});
  }, [props.gasto]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!props.gasto) return; // diálogo ya cerrado: evita duplicar por doble envío
    const r = gastoSchema.safeParse({ id: id ?? nuevoId(), nombre, monto: monto ?? NaN });
    if (!r.success) {
      const errs = erroresPorCampo(r.error);
      if (monto === null) errs.monto = 'Ingresá el monto';
      return setErrores(errs);
    }
    props.onGuardar(r.data);
  };

  return (
    <Dialog open={props.gasto !== null} onOpenChange={(v) => !v && props.onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>{id ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
            <DialogDescription>Se suma tal cual al total, sin descuento ni recargo.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1.4fr_1fr] gap-4">
            <Campo id="gasto-nombre" label="Nombre" error={errores.nombre}>
              <Input id="gasto-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus {...invalido('gasto-nombre', errores.nombre)} />
            </Campo>
            <Campo id="gasto-monto" label="Monto" error={errores.monto}>
              <InputDinero id="gasto-monto" value={monto} onValueChange={setMonto} {...invalido('gasto-monto', errores.monto)} />
            </Campo>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCerrar}>
              Cancelar
            </Button>
            <Button type="submit">{id ? 'Guardar cambios' : 'Agregar gasto'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
