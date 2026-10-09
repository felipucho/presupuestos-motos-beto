import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Bike, Percent, Plus, Search, X } from 'lucide-react';
import { AccionesFila, Confirmar, EncabezadoSeccion } from '@/components/acciones';
import { Campo, invalido } from '@/components/campo';
import { ColoresInput } from '@/components/colores-input';
import { EstadoVacio } from '@/components/estado-vacio';
import { InputDinero, InputNumero } from '@/components/inputs';
import { agruparPorMarca } from '@/components/moto-combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ajustarPrecio } from '@/lib/calculos';
import { useConfig } from '@/lib/config';
import { quitarPor, upsertPor } from '@/lib/listas';
import { formatoMoneda, formatoNumero } from '@/lib/formato';
import { erroresPorCampo, motoSchema, nuevoId, type Moto } from '@/lib/schema';
import { cn } from '@/lib/utils';

const TODAS = '__todas__';
const mismaMarca = (a: string, b: string) => a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es');
const normal = (t: string) => t.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function Catalogo() {
  const { config, actualizar } = useConfig();
  const [busqueda, setBusqueda] = useState('');
  const [marca, setMarca] = useState(TODAS);
  const [editando, setEditando] = useState<Moto | 'nuevo' | null>(null);
  const [borrando, setBorrando] = useState<Moto | null>(null);
  const [masiva, setMasiva] = useState(false);

  const grupos = useMemo(() => agruparPorMarca(config.motos), [config.motos]);
  const marcas = useMemo(() => grupos.map(([m]) => m), [grupos]);
  // Si la marca elegida ya no tiene motos, se muestra todo: se deriva en el render, sin efecto.
  const marcaActiva = marca === TODAS || marcas.includes(marca) ? marca : TODAS;

  const q = normal(busqueda.trim());
  const visibles = grupos
    .filter(([m]) => marcaActiva === TODAS || m === marcaActiva)
    .map(([m, motos]): [string, Moto[]] => [m, motos.filter((x) => !q || normal(`${x.marca} ${x.modelo} ${x.cilindrada} ${x.colores.join(' ')}`).includes(q))])
    .filter(([, motos]) => motos.length > 0);

  if (config.motos.length === 0) {
    return (
      <>
        <EncabezadoSeccion titulo="Catálogo de motos" descripcion="Las motos que se eligen al armar un presupuesto, con su precio de lista." />
        <Card>
          <CardContent className="px-5">
            <EstadoVacio
              icono={Bike}
              titulo="El catálogo está vacío"
              accion={
                <Button onClick={() => setEditando('nuevo')}>
                  <Plus /> Agregar la primera moto
                </Button>
              }
            >
              Cargá marca, modelo, colores y precio de lista. También se pueden agregar desde un presupuesto con «Otra moto…».
            </EstadoVacio>
          </CardContent>
        </Card>
        <MotoDialog moto={editando} marcas={marcas} onCerrar={() => setEditando(null)} onGuardar={(m) => (actualizar((c) => ({ ...c, motos: [...c.motos, m] }), 'Moto agregada'), setEditando(null))} />
      </>
    );
  }

  return (
    <>
      <EncabezadoSeccion titulo="Catálogo de motos" descripcion={`${config.motos.length} ${config.motos.length === 1 ? 'moto' : 'motos'} de ${marcas.length} ${marcas.length === 1 ? 'marca' : 'marcas'}.`}>
        <Button variant="outline" onClick={() => setMasiva(true)}>
          <Percent /> Actualizar precios
        </Button>
        <Button onClick={() => setEditando('nuevo')}>
          <Plus /> Agregar moto
        </Button>
      </EncabezadoSeccion>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-gris" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por modelo, cilindrada o color…" className="pl-9" aria-label="Buscar en el catálogo" />
          {busqueda && (
            <button type="button" aria-label="Borrar búsqueda" onClick={() => setBusqueda('')} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-tinta-gris hover:bg-gris-claro hover:text-tinta">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select value={marcaActiva} onValueChange={setMarca}>
          <SelectTrigger className="w-52" aria-label="Filtrar por marca">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las marcas</SelectItem>
            {marcas.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {visibles.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-tinta-gris">Ninguna moto coincide con la búsqueda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Modelo</TableHead>
                  <TableHead>Cilindrada</TableHead>
                  <TableHead>Colores</TableHead>
                  <TableHead className="text-right">Precio de lista</TableHead>
                  <TableHead className="text-right">Patentamiento</TableHead>
                  <TableHead className="w-24 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map(([m, motos]) => (
                  <Fragment key={m}>
                    <TableRow className="bg-papel hover:bg-papel">
                      <TableCell colSpan={6} className="py-1.5 pl-5 text-xs font-bold tracking-[0.08em] text-tinta-media uppercase">
                        {m} <span className="ml-1 font-medium tracking-normal text-tinta-gris normal-case">· {motos.length}</span>
                      </TableCell>
                    </TableRow>
                    {motos.map((x) => (
                      <TableRow key={x.id} className="group/fila">
                        <TableCell className="pl-5 font-medium">{x.modelo}</TableCell>
                        <TableCell className="text-tinta-media">{x.cilindrada || '—'}</TableCell>
                        <TableCell>
                          <div className="flex max-w-64 flex-wrap gap-1">
                            {x.colores.length === 0 ? (
                              <span className="text-tinta-gris">—</span>
                            ) : (
                              x.colores.map((c) => (
                                <span key={c} className="rounded bg-gris-claro px-1.5 py-0.5 text-xs text-tinta">
                                  {c}
                                </span>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="tabular text-right font-medium">{formatoMoneda(x.precioLista)}</TableCell>
                        <TableCell className="tabular text-right text-tinta-media">{x.patentamiento ? formatoMoneda(x.patentamiento) : '—'}</TableCell>
                        <TableCell className="pr-5">
                          <AccionesFila nombre={`${x.marca} ${x.modelo}`} onEditar={() => setEditando(x)} onBorrar={() => setBorrando(x)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MotoDialog
        moto={editando}
        marcas={marcas}
        onCerrar={() => setEditando(null)}
        onGuardar={(m) => {
          const existe = config.motos.some((x) => x.id === m.id);
          actualizar((c) => ({ ...c, motos: upsertPor(c.motos, m) }), existe ? 'Moto actualizada' : 'Moto agregada');
          setEditando(null);
        }}
      />
      <Confirmar
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo="¿Borrar esta moto del catálogo?"
        accion="Borrar moto"
        peligro
        onConfirmar={() => borrando && actualizar((c) => ({ ...c, motos: quitarPor(c.motos, borrando.id) }), 'Moto borrada')}
      >
        Se va a quitar <b>{borrando && `${borrando.marca} ${borrando.modelo}`}</b> del catálogo.
      </Confirmar>
      <ActualizacionMasiva
        abierto={masiva}
        onCerrar={() => setMasiva(false)}
        motos={config.motos}
        marcas={marcas}
        onAplicar={(pct, alcance) => {
          actualizar(
            (c) => ({ ...c, motos: c.motos.map((x) => (alcance === TODAS || mismaMarca(x.marca, alcance) ? { ...x, precioLista: ajustarPrecio(x.precioLista, pct) } : x)) }),
            'Precios actualizados',
          );
          setMasiva(false);
        }}
      />
    </>
  );
}

function MotoDialog(props: { moto: Moto | 'nuevo' | null; marcas: string[]; onCerrar: () => void; onGuardar: (m: Moto) => void }) {
  const [d, setD] = useState({ marca: '', modelo: '', cilindrada: '', colores: [] as string[], precioLista: null as number | null, patentamiento: null as number | null });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const id = props.moto && props.moto !== 'nuevo' ? props.moto.id : null;

  useEffect(() => {
    if (!props.moto) return;
    setD(props.moto === 'nuevo' ? { marca: '', modelo: '', cilindrada: '', colores: [], precioLista: null, patentamiento: null } : { ...props.moto });
    setErrores({});
  }, [props.moto]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!props.moto) return; // diálogo ya cerrado: evita duplicar por doble envío
    // Una marca ya cargada con otras mayúsculas se unifica con la existente.
    const marca = props.marcas.find((m) => mismaMarca(m, d.marca.trim())) ?? d.marca;
    const r = motoSchema.safeParse({ ...d, marca, id: id ?? nuevoId(), precioLista: d.precioLista ?? 0, patentamiento: d.patentamiento ?? 0 });
    if (!r.success) return setErrores(erroresPorCampo(r.error));
    props.onGuardar(r.data);
  };

  return (
    <Dialog open={props.moto !== null} onOpenChange={(v) => !v && props.onCerrar()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={enviar} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>{id ? 'Editar moto' : 'Nueva moto'}</DialogTitle>
            <DialogDescription>El precio de lista es la base para el contado y las cuotas.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Campo id="moto-marca" label="Marca" error={errores.marca}>
              <Input id="moto-marca" value={d.marca} onChange={(e) => setD({ ...d, marca: e.target.value })} autoFocus {...invalido('moto-marca', errores.marca)} />
            </Campo>
            <Campo id="moto-modelo" label="Modelo" error={errores.modelo}>
              <Input id="moto-modelo" value={d.modelo} onChange={(e) => setD({ ...d, modelo: e.target.value })} {...invalido('moto-modelo', errores.modelo)} />
            </Campo>
            <Campo id="moto-cc" label="Cilindrada" opcional>
              <Input id="moto-cc" value={d.cilindrada} onChange={(e) => setD({ ...d, cilindrada: e.target.value })} />
            </Campo>
            <Campo id="moto-precio" label="Precio de lista" error={errores.precioLista}>
              <InputDinero id="moto-precio" value={d.precioLista} onValueChange={(v) => setD({ ...d, precioLista: v })} {...invalido('moto-precio', errores.precioLista)} />
            </Campo>
            <Campo id="moto-patentamiento" label="Patentamiento" opcional error={errores.patentamiento} ayuda="Se suma automáticamente como gasto al elegir esta moto.">
              <InputDinero id="moto-patentamiento" value={d.patentamiento} onValueChange={(v) => setD({ ...d, patentamiento: v })} {...invalido('moto-patentamiento', errores.patentamiento)} />
            </Campo>
            <Campo id="moto-colores" label="Colores disponibles" opcional ayuda="Escribí un color y Enter (o coma) para agregarlo.">
              <ColoresInput id="moto-colores" value={d.colores} onChange={(colores) => setD({ ...d, colores })} />
            </Campo>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCerrar}>
              Cancelar
            </Button>
            <Button type="submit">{id ? 'Guardar cambios' : 'Agregar moto'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActualizacionMasiva(props: { abierto: boolean; onCerrar: () => void; motos: Moto[]; marcas: string[]; onAplicar: (pct: number, alcance: string) => void }) {
  const [alcance, setAlcance] = useState(TODAS);
  const [pct, setPct] = useState(NaN);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (props.abierto) {
      setAlcance(TODAS);
      setPct(NaN);
    }
  }, [props.abierto]);

  const error = Number.isNaN(pct) ? undefined : pct === 0 ? 'Ingresá un porcentaje distinto de 0' : pct <= -100 ? 'La baja tiene que ser menor a 100 %' : pct > 1000 ? 'Revisá el porcentaje' : undefined;
  const valido = !Number.isNaN(pct) && !error;
  const afectadas = props.motos
    .filter((m) => alcance === TODAS || mismaMarca(m.marca, alcance))
    .sort((a, b) => a.marca.localeCompare(b.marca, 'es') || a.modelo.localeCompare(b.modelo, 'es', { numeric: true }));

  return (
    <>
      <Dialog open={props.abierto} onOpenChange={(v) => !v && props.onCerrar()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Actualizar precios</DialogTitle>
            <DialogDescription>Aplica un porcentaje al precio de lista. Usá un número negativo para bajar precios. Se redondea al peso.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_200px] gap-4">
            <Campo id="masiva-alcance" label="Aplicar a">
              <Select value={alcance} onValueChange={setAlcance}>
                <SelectTrigger id="masiva-alcance" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todo el catálogo</SelectItem>
                  {props.marcas.map((m) => (
                    <SelectItem key={m} value={m}>
                      Sólo {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo id="masiva-pct" label="Porcentaje" error={error}>
              <InputNumero id="masiva-pct" value={pct} onValueChange={setPct} sufijo="%" autoFocus {...invalido('masiva-pct', error)} />
            </Campo>
          </div>

          <div className="overflow-hidden rounded-lg border border-gris-plano">
            <div className="max-h-72 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-papel-alto">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Moto</TableHead>
                    <TableHead className="text-right">Antes</TableHead>
                    <TableHead className="w-8" />
                    <TableHead className="pr-4 text-right">Después</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {afectadas.map((m) => {
                    const nuevo = valido ? ajustarPrecio(m.precioLista, pct) : null;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="pl-4">
                          <span className="font-medium">{m.marca}</span> {m.modelo}
                        </TableCell>
                        <TableCell className="tabular text-right text-tinta-media">{formatoMoneda(m.precioLista)}</TableCell>
                        <TableCell className="text-center text-tinta-gris">
                          <ArrowRight className="inline size-3.5" />
                        </TableCell>
                        <TableCell className={cn('tabular pr-4 text-right font-semibold', nuevo === null && 'font-normal text-tinta-gris')}>
                          {nuevo === null ? '—' : formatoMoneda(nuevo)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm text-tinta-gris">
              {afectadas.length} {afectadas.length === 1 ? 'moto' : 'motos'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={props.onCerrar}>
                Cancelar
              </Button>
              <Button disabled={!valido} onClick={() => setConfirmando(true)}>
                Aplicar {valido ? `${pct > 0 ? '+' : ''}${formatoNumero(pct)} %` : ''}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Confirmar
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        titulo={`¿Actualizar ${afectadas.length} ${afectadas.length === 1 ? 'precio' : 'precios'}?`}
        accion="Actualizar precios"
        onConfirmar={() => props.onAplicar(pct, alcance)}
      >
        Se va a aplicar <b>{valido && `${pct > 0 ? '+' : ''}${formatoNumero(pct)} %`}</b> a {alcance === TODAS ? 'todo el catálogo' : `las motos ${alcance}`}. El porcentaje inverso no siempre vuelve al precio anterior, por el redondeo: para volver atrás, importar un backup.
      </Confirmar>
    </>
  );
}
