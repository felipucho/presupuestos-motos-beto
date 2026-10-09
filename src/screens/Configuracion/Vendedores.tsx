import { useEffect, useState, type FormEvent } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { AccionesFila, Confirmar, EncabezadoSeccion } from '@/components/acciones';
import { Campo, invalido } from '@/components/campo';
import { EstadoVacio } from '@/components/estado-vacio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfig } from '@/lib/config';
import { enlaceWhatsapp } from '@/lib/formato';
import { erroresPorCampo, nuevoId, vendedorSchema, type Vendedor } from '@/lib/schema';

export function Vendedores() {
  const { config, actualizar } = useConfig();
  const [editando, setEditando] = useState<Vendedor | 'nuevo' | null>(null);
  const [borrando, setBorrando] = useState<Vendedor | null>(null);

  return (
    <>
      <EncabezadoSeccion titulo="Vendedores" descripcion="Quien hace el presupuesto. Su nombre y teléfono van en el PDF, con un código QR que abre su WhatsApp.">
        {config.vendedores.length > 0 && (
          <Button onClick={() => setEditando('nuevo')}>
            <Plus /> Agregar vendedor
          </Button>
        )}
      </EncabezadoSeccion>
      <Card className="py-2">
        <CardContent className="px-3">
          {config.vendedores.length === 0 ? (
            <div className="py-3">
              <EstadoVacio
                icono={UsersRound}
                titulo="Sin vendedores cargados"
                accion={
                  <Button onClick={() => setEditando('nuevo')}>
                    <Plus /> Agregar el primer vendedor
                  </Button>
                }
              >
                Nombre y celular de cada persona que arma presupuestos.
              </EstadoVacio>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead>WhatsApp del QR</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.vendedores.map((v) => (
                  <TableRow key={v.id} className="group/fila">
                    <TableCell className="font-medium">{v.nombre}</TableCell>
                    <TableCell className="tabular">{v.telefono}</TableCell>
                    <TableCell className="tabular text-tinta-gris">{enlaceWhatsapp(v.telefono)?.replace('https://', '')}</TableCell>
                    <TableCell>
                      <AccionesFila nombre={v.nombre} onEditar={() => setEditando(v)} onBorrar={() => setBorrando(v)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <VendedorDialog
        vendedor={editando}
        onCerrar={() => setEditando(null)}
        onGuardar={(v) => {
          const existe = config.vendedores.some((x) => x.id === v.id);
          actualizar((c) => ({ ...c, vendedores: existe ? c.vendedores.map((x) => (x.id === v.id ? v : x)) : [...c.vendedores, v] }), existe ? 'Vendedor actualizado' : 'Vendedor agregado');
          setEditando(null);
        }}
      />
      <Confirmar
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo="¿Borrar este vendedor?"
        accion="Borrar vendedor"
        peligro
        onConfirmar={() => borrando && actualizar((c) => ({ ...c, vendedores: c.vendedores.filter((x) => x.id !== borrando.id) }), 'Vendedor borrado')}
      >
        Se va a quitar <b>{borrando?.nombre}</b> de la lista de vendedores.
      </Confirmar>
    </>
  );
}

function VendedorDialog(props: { vendedor: Vendedor | 'nuevo' | null; onCerrar: () => void; onGuardar: (v: Vendedor) => void }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const id = props.vendedor && props.vendedor !== 'nuevo' ? props.vendedor.id : null;

  useEffect(() => {
    if (!props.vendedor) return;
    setNombre(props.vendedor === 'nuevo' ? '' : props.vendedor.nombre);
    setTelefono(props.vendedor === 'nuevo' ? '' : props.vendedor.telefono);
    setErrores({});
  }, [props.vendedor]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = vendedorSchema.safeParse({ id: id ?? nuevoId(), nombre, telefono });
    if (!r.success) return setErrores(erroresPorCampo(r.error));
    props.onGuardar(r.data);
  };

  return (
    <Dialog open={props.vendedor !== null} onOpenChange={(v) => !v && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>{id ? 'Editar vendedor' : 'Nuevo vendedor'}</DialogTitle>
            <DialogDescription>El celular se usa para el código QR de WhatsApp del presupuesto.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1.3fr_1fr] gap-4">
            <Campo id="vendedor-nombre" label="Nombre y apellido" error={errores.nombre}>
              <Input id="vendedor-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus {...invalido('vendedor-nombre', errores.nombre)} />
            </Campo>
            <Campo id="vendedor-telefono" label="Celular" error={errores.telefono} ayuda={errores.telefono ? undefined : 'Con código de área, sin 0 ni 15.'}>
              <Input id="vendedor-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" className="tabular" {...invalido('vendedor-telefono', errores.telefono)} />
            </Campo>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCerrar}>
              Cancelar
            </Button>
            <Button type="submit">{id ? 'Guardar cambios' : 'Agregar vendedor'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
