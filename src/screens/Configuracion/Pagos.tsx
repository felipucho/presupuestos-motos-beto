import { useEffect, useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { AccionesFila, Confirmar, EncabezadoSeccion } from '@/components/acciones';
import { Campo, invalido } from '@/components/campo';
import { EstadoVacio } from '@/components/estado-vacio';
import { InputNumero } from '@/components/inputs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { lineaPlan } from '@/lib/calculos';
import { useConfig } from '@/lib/config';
import { quitarPor, upsertPor } from '@/lib/listas';
import { etiquetaPlan, formatoMoneda, formatoNumero, formatoPesos } from '@/lib/formato';
import { configSchema, erroresPorCampo, nuevoId, planSchema, type Plan } from '@/lib/schema';

const EJEMPLO = 1_000_000;

export function Pagos() {
  const { config, actualizar } = useConfig();
  const [descuento, setDescuento] = useState(config.descuentoContado);
  const [errorDesc, setErrorDesc] = useState<string>();
  const [editando, setEditando] = useState<Plan | 'nuevo' | null>(null);
  const [borrando, setBorrando] = useState<Plan | null>(null);

  useEffect(() => setDescuento(config.descuentoContado), [config.descuentoContado]);

  const guardarDescuento = () => {
    const r = configSchema.shape.descuentoContado.safeParse(descuento);
    if (!r.success) return setErrorDesc(Number.isNaN(descuento) ? 'Ingresá un número' : r.error.issues[0]?.message);
    setErrorDesc(undefined);
    if (r.data !== config.descuentoContado) actualizar((c) => ({ ...c, descuentoContado: r.data }));
  };

  const planes = [...config.planesTarjeta].sort((a, b) => a.cuotas - b.cuotas);

  return (
    <>
      <EncabezadoSeccion titulo="Pagos" descripcion="El descuento de contado y los planes de tarjeta se aplican sobre el precio de lista de la moto. Los gastos no llevan descuento ni recargo." />
      <div className="grid gap-4">
        <Card>
          <CardHeader className="px-5">
            <CardTitle>Contado / transferencia</CardTitle>
            <CardDescription>Descuento sobre el precio de lista.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-start gap-5 px-5">
            <Campo id="descuento" label="Descuento" error={errorDesc} className="w-44">
              <InputNumero id="descuento" value={descuento} sufijo="%" onValueChange={setDescuento} onBlur={guardarDescuento} {...invalido('descuento', errorDesc)} />
            </Campo>
            {!errorDesc && descuento > 0 && (
              <p className="mt-8 text-sm text-tinta-gris">
                Ej.: una moto de {formatoMoneda(EJEMPLO)} queda en <span className="tabular font-medium text-tinta">{formatoMoneda(EJEMPLO * (1 - descuento / 100))}</span>.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between px-5">
            <div className="grid gap-1">
              <CardTitle>Planes de tarjeta</CardTitle>
              <CardDescription>Cantidad de cuotas y recargo sobre el precio de lista.</CardDescription>
            </div>
            {planes.length > 0 && (
              <Button onClick={() => setEditando('nuevo')}>
                <Plus /> Agregar plan
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-5">
            {planes.length === 0 ? (
              <EstadoVacio
                icono={CreditCard}
                titulo="Sin planes de tarjeta"
                accion={
                  <Button onClick={() => setEditando('nuevo')}>
                    <Plus /> Agregar el primer plan
                  </Button>
                }
              >
                Cargá las cuotas que ofrece el local, por ejemplo 3 cuotas con 15 % de recargo.
              </EstadoVacio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Recargo</TableHead>
                    <TableHead className="text-right">Ej. sobre {formatoMoneda(EJEMPLO)}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planes.map((p) => (
                    <TableRow key={p.id} className="group/fila">
                      <TableCell className="font-medium">{etiquetaPlan(p.cuotas)}</TableCell>
                      <TableCell className="tabular text-right">{p.recargo > 0 ? `+${formatoNumero(p.recargo)} %` : 'Sin recargo'}</TableCell>
                      <TableCell className="tabular text-right text-tinta-media">
                        {p.cuotas} × {formatoPesos(lineaPlan(EJEMPLO, p, 0).valorCuota ?? 0)}
                      </TableCell>
                      <TableCell>
                        <AccionesFila nombre={etiquetaPlan(p.cuotas)} onEditar={() => setEditando(p)} onBorrar={() => setBorrando(p)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <PlanDialog
        plan={editando}
        otros={config.planesTarjeta}
        onCerrar={() => setEditando(null)}
        onGuardar={(p) => {
          const existe = config.planesTarjeta.some((x) => x.id === p.id);
          actualizar((c) => ({ ...c, planesTarjeta: upsertPor(c.planesTarjeta, p) }), existe ? 'Plan actualizado' : 'Plan agregado');
          setEditando(null);
        }}
      />
      <Confirmar
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo="¿Borrar este plan?"
        accion="Borrar plan"
        peligro
        onConfirmar={() => borrando && actualizar((c) => ({ ...c, planesTarjeta: quitarPor(c.planesTarjeta, borrando.id) }), 'Plan borrado')}
      >
        Se va a quitar el plan de <b>{borrando && etiquetaPlan(borrando.cuotas)}</b>. Los presupuestos ya generados no cambian.
      </Confirmar>
    </>
  );
}

function PlanDialog(props: { plan: Plan | 'nuevo' | null; otros: Plan[]; onCerrar: () => void; onGuardar: (p: Plan) => void }) {
  const [cuotas, setCuotas] = useState(NaN);
  const [recargo, setRecargo] = useState(NaN);
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!props.plan) return;
    setCuotas(props.plan === 'nuevo' ? NaN : props.plan.cuotas);
    setRecargo(props.plan === 'nuevo' ? 0 : props.plan.recargo);
    setErrores({});
  }, [props.plan]);

  const id = props.plan && props.plan !== 'nuevo' ? props.plan.id : null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!props.plan) return; // diálogo ya cerrado: evita duplicar por doble envío
    const r = planSchema.safeParse({ id: id ?? nuevoId(), cuotas, recargo });
    if (!r.success) {
      const errs = erroresPorCampo(r.error);
      if (Number.isNaN(cuotas)) errs.cuotas = 'Ingresá la cantidad de cuotas';
      if (Number.isNaN(recargo)) errs.recargo = 'Ingresá el recargo (0 si no tiene)';
      return setErrores(errs);
    }
    if (props.otros.some((p) => p.cuotas === r.data.cuotas && p.id !== id)) return setErrores({ cuotas: `Ya hay un plan de ${etiquetaPlan(r.data.cuotas)}` });
    props.onGuardar(r.data);
  };

  return (
    <Dialog open={props.plan !== null} onOpenChange={(v) => !v && props.onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>{id ? 'Editar plan' : 'Nuevo plan de tarjeta'}</DialogTitle>
            <DialogDescription>El recargo se aplica sobre el precio de lista; la cuota es ese total dividido las cuotas.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Campo id="cuotas" label="Cuotas" error={errores.cuotas}>
              <InputNumero id="cuotas" value={cuotas} onValueChange={setCuotas} autoFocus {...invalido('cuotas', errores.cuotas)} />
            </Campo>
            <Campo id="recargo" label="Recargo" error={errores.recargo}>
              <InputNumero id="recargo" value={recargo} sufijo="%" onValueChange={setRecargo} {...invalido('recargo', errores.recargo)} />
            </Campo>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCerrar}>
              Cancelar
            </Button>
            <Button type="submit">{id ? 'Guardar cambios' : 'Agregar plan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
