import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PackageSearch, Plus, TriangleAlert, UserPlus, X } from 'lucide-react';
import { Campo, invalido } from '@/components/campo';
import { InputNumero } from '@/components/inputs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useConfig } from '@/lib/config';
import {
  aCentavos,
  clienteSchema,
  cuenta,
  diaDe,
  fiadoInusual,
  formatoDia,
  incobrablePendiente,
  MEDIOS,
  movimientoSchema,
  parecidos,
  quitarDevueltos,
  totalItems,
  unir,
  type Cargo,
  type Cliente,
  type Cuenta,
  type Item,
  type Medio,
  type Movimiento,
} from '@/lib/fiados';
import { ARMADO_VACIO, useFiados } from '@/lib/fiados-store';
import { formatoCentavos } from '@/lib/formato';
import { erroresPorCampo, nuevoId } from '@/lib/schema';
import { cn } from '@/lib/utils';
import { guardarComprobante, recibo, vale } from './comun';

type Vendedor = { id: string; nombre: string } | null;

const SIN = 'ninguno';
const hoy = () => diaDe(new Date());
const ahora = () => new Date().toISOString();
// Con mínimo: un año mal tipeado ("0026") queda primero en la cuenta y desordena los saldos.
const FECHA_MIN = '2000-01-01';
const fechaOk = (d: string, max: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= FECHA_MIN && d <= max;
const ERR_FECHA = 'Elegí una fecha entre el 01/01/2000 y hoy';
const pesos = (c: number) => c / 100;

/** Valida con el mismo esquema que la carga del archivo: lo que no pasa no se guarda. */
function validar(m: Movimiento): Movimiento | null {
  const r = movimientoSchema.safeParse(m);
  if (r.success) return r.data;
  toast.error('No se pudo guardar', { description: r.error.issues[0]?.message });
  return null;
}

function Ventana(props: { abierto: boolean; onCerrar: () => void; titulo: string; descripcion?: ReactNode; ancho?: string; children: ReactNode; pie: ReactNode }) {
  return (
    <Dialog open={props.abierto} onOpenChange={(v) => !v && props.onCerrar()}>
      <DialogContent className={cn('max-h-[92vh] overflow-y-auto', props.ancho ?? 'sm:max-w-lg')}>
        <DialogHeader>
          <DialogTitle>{props.titulo}</DialogTitle>
          {props.descripcion && <DialogDescription>{props.descripcion}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-4">{props.children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onCerrar}>
            Cancelar
          </Button>
          {props.pie}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Aviso({ children, tono = 'aviso' }: { children: ReactNode; tono?: 'aviso' | 'error' }) {
  return (
    <div className={cn('flex gap-2 rounded-lg px-3 py-2.5 text-sm', tono === 'error' ? 'bg-error-suave text-error' : 'bg-naranja/12 text-naranja-hondo')} role="status">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Chips({ opciones, onElegir }: { opciones: string[]; onElegir: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onElegir(o)}
          className="rounded-full border border-gris-plano px-2.5 py-0.5 text-xs text-tinta-media transition-colors hover:bg-gris-claro focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:outline-none"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function CampoFecha({ id, label, value, onChange, min = FECHA_MIN, max, opcional, error }: { id: string; label: string; value: string; onChange: (v: string) => void; min?: string; max?: string; opcional?: boolean; error?: string }) {
  return (
    <Campo id={id} label={label} opcional={opcional} error={error}>
      <Input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} {...invalido(id, error)} />
    </Campo>
  );
}

function ElegirVendedor({ value, onChange }: { value: Vendedor; onChange: (v: Vendedor) => void }) {
  const { config } = useConfig();
  if (config.vendedores.length === 0) return null;
  return (
    <Campo id="fiado-vendedor" label="Atendió" opcional>
      <Select value={value?.id ?? SIN} onValueChange={(id) => onChange(config.vendedores.find((v) => v.id === id) ?? null)}>
        <SelectTrigger id="fiado-vendedor" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN}>Sin indicar</SelectItem>
          {config.vendedores.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Campo>
  );
}

const montoError = (v: number) => (Number.isNaN(v) ? 'Ingresá un monto' : aCentavos(v) <= 0 ? 'Tiene que ser mayor a $ 0' : undefined);

/* ───────────────────────── Cliente ───────────────────────── */

const vacio = { nombre: '', telefono: '', dni: '', direccion: '', referencia: '', nota: '', limite: NaN };

export function ClienteDialog({ abierto, cliente, onCerrar, onGuardado }: { abierto: boolean; cliente: Cliente | null; onCerrar: () => void; onGuardado?: (id: string) => void }) {
  const { fiados, cambiar } = useFiados();
  const [f, setF] = useState(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!abierto) return;
    setErrores({});
    setF(cliente ? { ...cliente, limite: cliente.limite === null ? NaN : pesos(cliente.limite) } : vacio);
  }, [abierto, cliente]);

  const id = cliente?.id ?? '';
  const repetidos = useMemo(() => (fiados && abierto ? parecidos(fiados.clientes, { id, nombre: f.nombre, telefono: f.telefono, dni: f.dni }) : []), [fiados, abierto, id, f.nombre, f.telefono, f.dni]);

  const guardar = () => {
    if (!abierto) return; // ya guardado y cerrándose: evita crear otro cliente
    const limite = Number.isNaN(f.limite) ? null : aCentavos(f.limite);
    if (limite !== null && limite <= 0) return setErrores({ limite: 'Dejalo vacío para no poner límite' });
    const nuevo = { ...(cliente ?? { id: nuevoId(), noFiar: false, archivado: false, creado: ahora() }), ...f, limite };
    const r = clienteSchema.safeParse(nuevo);
    if (!r.success) return setErrores(erroresPorCampo(r.error));
    cambiar(
      (x) => ({ ...x, clientes: cliente ? x.clientes.map((c) => (c.id === cliente.id ? r.data : c)) : [...x.clientes, r.data] }),
      cliente ? 'Cliente guardado' : 'Cliente creado',
    );
    onGuardado?.(r.data.id);
    onCerrar();
  };

  const texto = (k: 'nombre' | 'telefono' | 'dni' | 'direccion' | 'referencia') => ({
    id: `cli-${k}`,
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
    ...invalido(`cli-${k}`, errores[k]),
  });

  return (
    <Ventana abierto={abierto} onCerrar={onCerrar} titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'} ancho="sm:max-w-xl" pie={<Button onClick={guardar}>Guardar</Button>}>
      <div className="grid grid-cols-2 gap-4">
        <Campo id="cli-nombre" label="Nombre y apellido" error={errores.nombre} className="col-span-2">
          <Input {...texto('nombre')} autoFocus />
        </Campo>
        <Campo id="cli-telefono" label="Celular" opcional ayuda="Con código de área, para mandarle el saldo por WhatsApp.">
          <Input {...texto('telefono')} inputMode="tel" />
        </Campo>
        <Campo id="cli-dni" label="DNI" opcional>
          <Input {...texto('dni')} inputMode="numeric" />
        </Campo>
        <Campo id="cli-direccion" label="Dirección" opcional>
          <Input {...texto('direccion')} />
        </Campo>
        <Campo id="cli-referencia" label="Referencia o garante" opcional>
          <Input {...texto('referencia')} />
        </Campo>
        <Campo id="cli-limite" label="Límite de fiado" opcional error={errores.limite} ayuda="Si lo pasa, la app avisa antes de fiarle.">
          <InputNumero id="cli-limite" value={f.limite} onValueChange={(v) => setF({ ...f, limite: v })} placeholder="Sin límite" {...invalido('cli-limite', errores.limite)} />
        </Campo>
        <Campo id="cli-nota" label="Nota" opcional className="col-span-2">
          <Textarea id="cli-nota" value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} className="min-h-14" />
        </Campo>
      </div>
      {repetidos.length > 0 && (
        <Aviso>
          Se parece a {repetidos.map((c) => `«${c.nombre}»${c.archivado ? ' (archivado)' : ''}`).join(', ')}. Si es la misma persona, no lo cargues de nuevo: usá ese cliente o uní los dos después.
        </Aviso>
      )}
    </Ventana>
  );
}

/* ───────────────────────── Cargo ───────────────────────── */

const LIBRE = { detalle: '', cantidad: 1, precio: NaN };

export function CargoDialog({ abierto, onCerrar, irARepuestos, onCargado }: { abierto: boolean; onCerrar: () => void; irARepuestos: () => void; onCargado: (clienteId: string) => void }) {
  const { config } = useConfig();
  const { fiados, cambiar, armado, setArmado } = useFiados();
  const [fecha, setFecha] = useState(hoy);
  const [vendedor, setVendedor] = useState<Vendedor>(null);
  const [nota, setNota] = useState('');
  const [igual, setIgual] = useState(false);
  const [libre, setLibre] = useState(LIBRE);
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setFecha(hoy());
    setNota('');
    setIgual(false);
    setLibre(LIBRE);
    setIntento(false);
  }, [abierto]);

  const activos = useMemo(() => (fiados?.clientes ?? []).filter((c) => !c.archivado || c.id === armado.clienteId).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [fiados, armado.clienteId]);
  const cliente = fiados?.clientes.find((c) => c.id === armado.clienteId) ?? null;
  const movsCliente = cliente && fiados ? fiados.movimientos.filter((m) => m.clienteId === cliente.id) : [];
  const k: Cuenta | null = cliente && fiados ? cuenta(movsCliente, hoy()) : null;
  const total = totalItems(armado.items);
  const ganancia = armado.items.reduce((a, i) => a + (i.costo === null ? 0 : (i.precio - i.costo) * i.cantidad), 0);
  const conCosto = armado.items.some((i) => i.costo !== null);

  const superaLimite = cliente?.limite != null && k !== null && k.saldo + total > cliente.limite;
  const inusual = cliente !== null && fiadoInusual(movsCliente, total);
  const hayAviso = Boolean(cliente?.noFiar || superaLimite || inusual);
  const errFecha = fechaOk(fecha, hoy()) ? undefined : ERR_FECHA;

  // "Fiarle igual" vale para el cliente y el aviso que se vieron: si cambian, hay que volver a confirmar.
  useEffect(() => setIgual(false), [armado.clienteId, inusual, superaLimite, cliente?.noFiar]);

  const setItem = (n: number, cambio: Partial<Item>) => setArmado((a) => ({ ...a, items: a.items.map((x, i) => (i === n ? { ...x, ...cambio } : x)) }));
  const quitar = (n: number) => setArmado((a) => ({ ...a, items: a.items.filter((_, i) => i !== n) }));

  const cantidadOk = Number.isInteger(libre.cantidad) && libre.cantidad >= 1 && libre.cantidad <= 9999;
  const libreErr = { detalle: libre.detalle.trim() ? undefined : 'Escribí qué se lleva', precio: montoError(libre.precio), cantidad: cantidadOk ? undefined : 'Entero entre 1 y 9999' };
  const libreValido = !libreErr.detalle && !libreErr.precio && !libreErr.cantidad;
  const agregarLibre = () => {
    if (!libreValido) return;
    setArmado((a) => ({ ...a, items: [...a.items, { codigo: '', detalle: libre.detalle.trim(), cantidad: libre.cantidad, precio: aCentavos(libre.precio), costo: null }] }));
    setLibre(LIBRE);
  };

  const confirmar = () => {
    setIntento(true);
    if (!cliente || armado.items.length === 0 || errFecha || (hayAviso && !igual)) return;
    const m = validar({ id: nuevoId(), clienteId: cliente.id, tipo: 'cargo', items: armado.items, fecha, registrado: ahora(), nota, vendedor, anulado: null });
    if (m?.tipo !== 'cargo') return;
    cambiar((x) => ({ ...x, movimientos: [...x.movimientos, m] }));
    toast.success(`Fiado cargado a ${cliente.nombre}`, {
      description: formatoCentavos(total),
      action: { label: 'Guardar vale', onClick: () => void guardarComprobante(vale(config.local, cliente, m), config.local.carpetaPdf) },
      duration: 10000,
    });
    setArmado(ARMADO_VACIO);
    onCargado(cliente.id);
    onCerrar();
  };

  return (
    <Ventana
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cargar fiado"
      descripcion="Los precios quedan fijos en pesos: si la lista sube, la deuda no cambia."
      ancho="sm:max-w-3xl"
      pie={
        <Button onClick={confirmar} disabled={!cliente || armado.items.length === 0 || (hayAviso && !igual)}>
          {hayAviso ? 'Fiar igual' : 'Cargar fiado'} · {formatoCentavos(total)}
        </Button>
      }
    >
      <div className="flex items-end gap-2">
        <Campo id="cargo-cliente" label="Cliente" className="flex-1" error={intento && !cliente ? 'Elegí el cliente' : undefined}>
          <Select value={armado.clienteId ?? ''} onValueChange={(id) => setArmado((a) => ({ ...a, clienteId: id }))}>
            <SelectTrigger id="cargo-cliente" className="w-full" {...invalido('cargo-cliente', intento && !cliente ? 'x' : undefined)}>
              <SelectValue placeholder="Elegí a quién se le fía…" />
            </SelectTrigger>
            <SelectContent>
              {activos.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                  {c.telefono && <span className="text-tinta-gris"> · {c.telefono}</span>}
                  {c.noFiar && <span className="text-error"> · no fiar</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Button variant="outline" onClick={() => setNuevoCliente(true)}>
          <UserPlus /> Nuevo
        </Button>
      </div>

      {k && cliente && (
        <p className="-mt-2 text-sm text-tinta-media">
          Hoy debe <b className="tabular">{formatoCentavos(Math.max(0, k.saldo))}</b>
          {k.saldo < 0 && <> y tiene {formatoCentavos(-k.saldo)} a favor, que se descuenta de este fiado</>}
          {cliente.limite !== null && <> · límite {formatoCentavos(cliente.limite)}</>}.
        </p>
      )}

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Artículos</p>
          <Button variant="outline" size="sm" onClick={() => { onCerrar(); irARepuestos(); }}>
            <PackageSearch /> Buscar en CM
          </Button>
        </div>
        {armado.items.length === 0 ? (
          <p className={cn('rounded-lg border border-dashed border-gris-plano px-4 py-5 text-center text-sm', intento ? 'text-error' : 'text-tinta-gris')}>
            Todavía no hay artículos.
          </p>
        ) : (
          <div className="grid gap-1.5">
            <div className="grid grid-cols-[1fr_5rem_8rem_7rem_2rem] gap-2 px-1 text-xs font-medium text-tinta-gris">
              <span>Detalle</span>
              <span className="text-right">Cant.</span>
              <span className="text-right">Unitario</span>
              <span className="text-right">Subtotal</span>
              <span />
            </div>
            {armado.items.map((i, n) => (
              <div key={n} className="grid grid-cols-[1fr_5rem_8rem_7rem_2rem] items-center gap-2">
                <div className="min-w-0">
                  <Input value={i.detalle} onChange={(e) => setItem(n, { detalle: e.target.value })} aria-label="Detalle" className="h-9" />
                  {(i.codigo || i.costo !== null) && (
                    <p className="tabular mt-0.5 truncate px-1 text-[11px] text-tinta-gris">
                      {[i.codigo, i.costo !== null && `costo ${formatoCentavos(i.costo)}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <InputNumero value={i.cantidad} onValueChange={(v) => Number.isInteger(v) && v >= 1 && v <= 9999 && setItem(n, { cantidad: v })} aria-label="Cantidad" className="h-9" />
                <InputNumero value={pesos(i.precio)} onValueChange={(v) => !Number.isNaN(v) && aCentavos(v) > 0 && setItem(n, { precio: aCentavos(v) })} aria-label="Precio unitario" className="h-9" />
                <span className="tabular text-right text-sm font-medium">{formatoCentavos(i.precio * i.cantidad)}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Quitar ${i.detalle}`} title="Quitar" onClick={() => quitar(n)}>
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_5rem_8rem_auto] items-start gap-2 rounded-lg bg-gris-claro/50 p-2">
          <Input value={libre.detalle} onChange={(e) => setLibre({ ...libre, detalle: e.target.value })} aria-label="Detalle del ítem a mano" className="h-9" onKeyDown={(e) => e.key === 'Enter' && agregarLibre()} />
          <InputNumero value={libre.cantidad} onValueChange={(v) => setLibre({ ...libre, cantidad: v })} aria-label="Cantidad del ítem a mano" className="h-9" />
          <InputNumero value={libre.precio} onValueChange={(v) => setLibre({ ...libre, precio: v })} placeholder="Precio" aria-label="Precio unitario del ítem a mano" className="h-9" onKeyDown={(e) => e.key === 'Enter' && agregarLibre()} />
          <Button variant="outline" className="h-9" onClick={agregarLibre} disabled={!libreValido}>
            <Plus /> Agregar
          </Button>
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-gris-claro pt-3">
        <span className="text-sm text-tinta-media">{conCosto && <>Ganancia estimada: <b className="tabular">{formatoCentavos(ganancia)}</b></>}</span>
        <span className="text-sm">
          Total <b className="tabular text-lg">{formatoCentavos(total)}</b>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <CampoFecha id="cargo-fecha" label="Fecha del fiado" value={fecha} onChange={setFecha} max={hoy()} error={errFecha} />
          <ElegirVendedor value={vendedor} onChange={setVendedor} />
      </div>
      <Campo id="cargo-nota" label="Nota" opcional>
        <Input id="cargo-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>

      {cliente && hayAviso && (
        <Aviso tono="error">
          <ul className="grid gap-0.5">
            {cliente.noFiar && <li>Este cliente está marcado «no fiar más».</li>}
            {superaLimite && <li>Con este fiado debería {formatoCentavos((k?.saldo ?? 0) + total)} y su límite es {formatoCentavos(cliente.limite ?? 0)}.</li>}
            {inusual && <li>{formatoCentavos(total)} es mucho más de lo que se le suele fiar. Revisá los precios y cantidades.</li>}
          </ul>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <Checkbox checked={igual} onCheckedChange={(v) => setIgual(v === true)} /> Fiarle igual
          </label>
        </Aviso>
      )}
      {/* Anidado: queda encima del fiado sin cerrarlo, así no se pierde lo cargado. */}
      <ClienteDialog abierto={nuevoCliente} cliente={null} onCerrar={() => setNuevoCliente(false)} onGuardado={(id) => setArmado((a) => ({ ...a, clienteId: id }))} />
    </Ventana>
  );
}

/* ───────────────────────── Pago ───────────────────────── */

export function PagoDialog({ cliente, k, abierto, onCerrar }: { cliente: Cliente; k: Cuenta; abierto: boolean; onCerrar: () => void }) {
  const { config } = useConfig();
  const { cambiar, fiados } = useFiados();
  const [monto, setMonto] = useState(NaN);
  const [medio, setMedio] = useState<Medio>('efectivo');
  const [fecha, setFecha] = useState(hoy);
  const [vendedor, setVendedor] = useState<Vendedor>(null);
  const [nota, setNota] = useState('');
  const [recuperar, setRecuperar] = useState(true);
  const [seguro, setSeguro] = useState(false);
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setMonto(k.saldo > 0 ? pesos(k.saldo) : NaN);
    setMedio('efectivo');
    setFecha(hoy());
    setNota('');
    setRecuperar(true);
    setSeguro(false);
    setIntento(false);
  }, [abierto]);

  const movs = useMemo(() => fiados?.movimientos.filter((x) => x.clienteId === cliente.id) ?? [], [fiados, cliente.id]);
  const errMonto = montoError(monto);
  const errFecha = fechaOk(fecha, hoy()) ? undefined : ERR_FECHA;
  const c = Number.isNaN(monto) ? 0 : aCentavos(monto);
  const queda = k.saldo - c;
  // Lo que paga de más sobre una deuda dada por incobrable recupera esa deuda, no queda a favor.
  const incobrable = incobrablePendiente(movs);
  const recupero = c > 0 && queda < 0 && recuperar ? Math.min(-queda, incobrable) : 0;
  const resto = queda + recupero;
  // A favor más grande que lo que debía: suele ser un cero de más.
  const exagerado = c > 0 && -resto > Math.max(0, k.saldo);

  const confirmar = () => {
    setIntento(true);
    if (!abierto || errMonto || errFecha || (exagerado && !seguro)) return; // ya cobrado y cerrándose: evita pago duplicado
    const r = recupero > 0 ? validar({ id: nuevoId(), clienteId: cliente.id, tipo: 'ajuste', monto: recupero, fecha, registrado: ahora(), nota: 'Recupero de incobrable', vendedor, anulado: null }) : null;
    if (recupero > 0 && !r) return;
    const m = validar({ id: nuevoId(), clienteId: cliente.id, tipo: 'pago', monto: c, medio, fecha, registrado: ahora(), nota, vendedor, anulado: null });
    if (m?.tipo !== 'pago' || !fiados) return;
    const nuevos = r ? [r, m] : [m];
    const todos = [...movs, ...nuevos];
    const dia = hoy();
    cambiar((x) => ({ ...x, movimientos: [...x.movimientos, ...nuevos] }));
    toast.success(`Pago de ${cliente.nombre} registrado`, {
      description: [recupero > 0 && `Recuperó ${formatoCentavos(recupero)} de lo incobrable.`, resto > 0 ? `Le quedan ${formatoCentavos(resto)}` : resto < 0 ? `Quedan ${formatoCentavos(-resto)} a favor` : 'Quedó al día'].filter(Boolean).join(' '),
      action: { label: 'Guardar recibo', onClick: () => void guardarComprobante(recibo(config.local, cliente, m, todos, dia), config.local.carpetaPdf) },
      duration: 10000,
    });
    onCerrar();
  };

  return (
    <Ventana
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Pago de ${cliente.nombre}`}
      descripcion={k.saldo > 0 ? `Debe ${formatoCentavos(k.saldo)}.` : k.saldo < 0 ? `Tiene ${formatoCentavos(-k.saldo)} a favor.` : 'Está al día.'}
      pie={
        <Button onClick={confirmar} disabled={exagerado && !seguro}>
          Registrar pago
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Campo id="pago-monto" label="Monto ($)" error={intento ? errMonto : undefined}>
          <InputNumero
            id="pago-monto"
            value={monto}
            onValueChange={(v) => {
              setMonto(v);
              setSeguro(false);
            }}
            autoFocus
            {...invalido('pago-monto', intento ? errMonto : undefined)}
          />
        </Campo>
        <Campo id="pago-medio" label="Medio">
          <Select value={medio} onValueChange={(v) => setMedio(v as Medio)}>
            <SelectTrigger id="pago-medio" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEDIOS.map(([id, nombre]) => (
                <SelectItem key={id} value={id}>
                  {nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <CampoFecha id="pago-fecha" label="Fecha del pago" value={fecha} onChange={setFecha} max={hoy()} error={errFecha} />
        <ElegirVendedor value={vendedor} onChange={setVendedor} />
      </div>
      {k.saldo > 0 && c > 0 && c < k.saldo && <p className="text-sm text-tinta-media">Pago parcial: le quedan <b className="tabular">{formatoCentavos(queda)}</b>.</p>}
      {c > 0 && queda < 0 && incobrable > 0 && (
        <Aviso>
          Tiene {formatoCentavos(incobrable)} dados por incobrable.
          <label className="mt-2 flex items-center gap-2 font-medium">
            <Checkbox checked={recuperar} onCheckedChange={(v) => setRecuperar(v === true)} /> Recuperar {formatoCentavos(Math.min(-queda, incobrable))} de esa deuda en vez de dejarlos a favor
          </label>
        </Aviso>
      )}
      {exagerado ? (
        <Aviso tono="error">
          Paga {formatoCentavos(c)} y {k.saldo > 0 ? `debe ${formatoCentavos(k.saldo)}` : 'no debe nada'}: le quedarían {formatoCentavos(-resto)} a favor. Revisá que el monto no tenga un cero de más.
          <label className="mt-2 flex items-center gap-2 font-medium">
            <Checkbox checked={seguro} onCheckedChange={(v) => setSeguro(v === true)} /> El monto es correcto
          </label>
        </Aviso>
      ) : (
        c > 0 && resto < 0 && <Aviso>Paga {formatoCentavos(-resto)} de más: le quedan a favor y se descuentan del próximo fiado.</Aviso>
      )}
      <Campo id="pago-nota" label="Nota" opcional>
        <Input id="pago-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>
    </Ventana>
  );
}

/* ───────────────────────── Ajuste ───────────────────────── */

export function AjusteDialog({ cliente, k, modo, onCerrar }: { cliente: Cliente; k: Cuenta; modo: 'ajuste' | 'incobrable' | null; onCerrar: () => void }) {
  const { cambiar } = useFiados();
  const [sentido, setSentido] = useState<'restar' | 'sumar'>('restar');
  const [monto, setMonto] = useState(NaN);
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [archivar, setArchivar] = useState(true);
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    if (!modo) return;
    setSentido('restar');
    setMonto(modo === 'incobrable' && k.saldo > 0 ? pesos(k.saldo) : NaN);
    setMotivo(modo === 'incobrable' ? 'Incobrable' : '');
    setFecha(hoy());
    setArchivar(true);
    setIntento(false);
  }, [modo]);

  const errMonto = montoError(monto);
  const errMotivo = motivo.trim() ? undefined : 'Escribí el motivo: queda en la cuenta';
  const errFecha = fechaOk(fecha, hoy()) ? undefined : ERR_FECHA;

  const confirmar = () => {
    setIntento(true);
    if (!modo || errMonto || errMotivo || errFecha) return; // ya aplicado y cerrándose: evita ajuste duplicado
    const c = aCentavos(monto) * (sentido === 'restar' ? -1 : 1);
    // La palabra en el motivo es lo que después permite recuperarlo con un pago (incobrablePendiente).
    const nota = modo === 'incobrable' && !/incobrable/i.test(motivo) ? `Incobrable: ${motivo.trim()}` : motivo.trim();
    const m = validar({ id: nuevoId(), clienteId: cliente.id, tipo: 'ajuste', monto: c, fecha, registrado: ahora(), nota, vendedor: null, anulado: null });
    if (!m) return;
    const cerrar = modo === 'incobrable' && archivar;
    cambiar(
      (x) => ({
        movimientos: [...x.movimientos, m],
        clientes: cerrar ? x.clientes.map((y) => (y.id === cliente.id ? { ...y, noFiar: true, archivado: true } : y)) : x.clientes,
      }),
      cerrar ? 'Deuda dada por incobrable y cliente archivado' : 'Ajuste cargado',
    );
    onCerrar();
  };

  return (
    <Ventana
      abierto={modo !== null}
      onCerrar={onCerrar}
      titulo={modo === 'incobrable' ? 'Dar por incobrable' : 'Ajuste de saldo'}
      descripcion={
        modo === 'incobrable'
          ? 'Saca la deuda de lo que hay para cobrar. Queda registrada en la cuenta por si algún día paga.'
          : 'Para descuentos, redondeos o actualizar la deuda a mano. Queda a la vista con su motivo.'
      }
      pie={<Button onClick={confirmar}>{modo === 'incobrable' ? 'Dar por incobrable' : 'Cargar ajuste'}</Button>}
    >
      {modo === 'ajuste' && (
        <div role="radiogroup" aria-label="Sentido" className="flex w-fit rounded-lg bg-gris-claro/70 p-1">
          {(
            [
              ['restar', 'Descontar'],
              ['sumar', 'Sumar a la deuda'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={sentido === id}
              onClick={() => setSentido(id)}
              className={cn('h-8 rounded-md px-3 text-sm font-medium transition-colors', sentido === id ? 'bg-papel-alto text-tinta shadow-xs ring-1 ring-gris-plano' : 'text-tinta-media hover:text-tinta')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Campo id="ajuste-monto" label="Monto ($)" error={intento ? errMonto : undefined}>
          <InputNumero id="ajuste-monto" value={monto} onValueChange={setMonto} {...invalido('ajuste-monto', intento ? errMonto : undefined)} />
        </Campo>
        <CampoFecha id="ajuste-fecha" label="Fecha" value={fecha} onChange={setFecha} max={hoy()} error={errFecha} />
      </div>
      <Campo id="ajuste-motivo" label="Motivo" error={intento ? errMotivo : undefined}>
        <Input id="ajuste-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} {...invalido('ajuste-motivo', intento ? errMotivo : undefined)} />
      </Campo>
      {modo === 'ajuste' && (
        <Chips
          opciones={sentido === 'restar' ? ['Descuento', 'Redondeo', 'Arreglo con el cliente'] : ['Actualización de precio', 'Interés acordado', 'Corrección']}
          onElegir={setMotivo}
        />
      )}
      {modo === 'incobrable' && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={archivar} onCheckedChange={(v) => setArchivar(v === true)} /> Marcar «no fiar más» y archivar el cliente
        </label>
      )}
    </Ventana>
  );
}

/* ───────────────────────── Anular ───────────────────────── */

export function AnularDialog({ mov, onCerrar }: { mov: Movimiento | null; onCerrar: () => void }) {
  const { cambiar } = useFiados();
  const [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    setMotivo('');
    setIntento(false);
  }, [mov]);

  const confirmar = () => {
    setIntento(true);
    if (!mov || !motivo.trim()) return;
    const anulado = { fecha: ahora(), motivo: motivo.trim() };
    cambiar((x) => ({ ...x, movimientos: x.movimientos.map((m) => (m.id === mov.id ? { ...m, anulado } : m)) }), 'Movimiento anulado');
    onCerrar();
  };

  const que = mov?.tipo === 'cargo' ? 'el fiado' : mov?.tipo === 'pago' ? 'el pago' : 'el ajuste';
  return (
    <Ventana
      abierto={mov !== null}
      onCerrar={onCerrar}
      titulo={`Anular ${que}`}
      descripcion={mov && `Del ${formatoDia(mov.fecha)}. Deja de contar en el saldo, pero queda tachado en la cuenta con el motivo.`}
      pie={
        <Button className="bg-error! hover:bg-error/88!" onClick={confirmar}>
          Anular
        </Button>
      }
    >
      <Campo id="anular-motivo" label="Motivo" error={intento && !motivo.trim() ? 'Escribí el motivo' : undefined}>
        <Input id="anular-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus {...invalido('anular-motivo', intento && !motivo.trim() ? 'x' : undefined)} />
      </Campo>
      <Chips opciones={['Cargado por error', 'Monto equivocado', 'Cliente equivocado', 'Duplicado']} onElegir={setMotivo} />
    </Ventana>
  );
}

/* ───────────────────────── Devolución ───────────────────────── */

export function DevolverDialog({ cargo, onCerrar }: { cargo: Cargo | null; onCerrar: () => void }) {
  const { cambiar } = useFiados();
  const [devueltos, setDevueltos] = useState<number[]>([]);

  useEffect(() => setDevueltos(cargo?.items.map(() => 0) ?? []), [cargo]);

  if (!cargo) return <Ventana abierto={false} onCerrar={onCerrar} titulo="" pie={null}>{null}</Ventana>;
  const quedan = quitarDevueltos(cargo.items, devueltos);
  const devuelto = totalItems(cargo.items) - totalItems(quedan);
  const detalle = cargo.items
    .map((i, n) => [i, Math.min(i.cantidad, devueltos[n] ?? 0)] as const)
    .filter(([, d]) => d > 0)
    .map(([i, d]) => `${i.detalle} ×${d}`)
    .join(', ');

  // El cargo original se anula y, si quedó algo, se carga uno nuevo con la misma fecha: el saldo,
  // la antigüedad y la ganancia quedan bien sin tener que repartir la devolución a mano.
  const confirmar = () => {
    if (devuelto === 0) return;
    const reemplazo: Movimiento | null =
      quedan.length > 0
        ? validar({ ...cargo, id: nuevoId(), items: quedan, registrado: ahora(), nota: [cargo.nota, `Quedó tras devolver ${detalle}`].filter(Boolean).join(' · '), anulado: null })
        : null;
    if (quedan.length > 0 && !reemplazo) return;
    const anulado = { fecha: ahora(), motivo: `Devolución: ${detalle}` };
    cambiar((x) => ({ ...x, movimientos: [...x.movimientos.map((m) => (m.id === cargo.id ? { ...m, anulado } : m)), ...(reemplazo ? [reemplazo] : [])] }), 'Devolución registrada');
    onCerrar();
  };

  return (
    <Ventana
      abierto
      onCerrar={onCerrar}
      titulo="Devolución"
      descripcion={`Fiado del ${formatoDia(cargo.fecha)}. Indicá cuántas unidades de cada artículo devuelve.`}
      pie={
        <Button onClick={confirmar} disabled={devuelto === 0}>
          Devolver {formatoCentavos(devuelto)}
        </Button>
      }
    >
      <div className="grid gap-2">
        {cargo.items.map((i, n) => (
          <div key={n} className="grid grid-cols-[1fr_6rem] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{i.detalle}</p>
              <p className="tabular text-xs text-tinta-gris">
                Se llevó {i.cantidad} × {formatoCentavos(i.precio)}
              </p>
            </div>
            <InputNumero
              value={devueltos[n] ?? 0}
              onValueChange={(v) => Number.isInteger(v) && v >= 0 && v <= i.cantidad && setDevueltos((d) => d.map((x, j) => (j === n ? v : x)))}
              aria-label={`Unidades devueltas de ${i.detalle}`}
              sufijo={`/${i.cantidad}`}
            />
          </div>
        ))}
      </div>
      {devuelto > 0 && (
        <p className="text-sm text-tinta-media">
          {quedan.length === 0 ? 'Devuelve todo: el fiado queda anulado.' : `El fiado pasa a ${formatoCentavos(totalItems(quedan))}.`}
        </p>
      )}
    </Ventana>
  );
}

/* ───────────────────────── Unir clientes ───────────────────────── */

export function UnirDialog({ cliente, abierto, onCerrar, onUnido }: { cliente: Cliente; abierto: boolean; onCerrar: () => void; onUnido: (id: string) => void }) {
  const { fiados, cambiar } = useFiados();
  const [destino, setDestino] = useState('');

  useEffect(() => setDestino(''), [abierto]);

  const otros = (fiados?.clientes ?? []).filter((c) => c.id !== cliente.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const elegido = otros.find((c) => c.id === destino);
  const cantidad = fiados?.movimientos.filter((m) => m.clienteId === cliente.id).length ?? 0;

  const confirmar = () => {
    if (!elegido) return;
    cambiar((x) => unir(x, cliente.id, elegido.id), `Clientes unidos en «${elegido.nombre}»`);
    onUnido(elegido.id);
    onCerrar();
  };

  return (
    <Ventana
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Unir con otro cliente"
      descripcion="Para cuando la misma persona quedó cargada dos veces."
      pie={
        <Button onClick={confirmar} disabled={!elegido}>
          Unir
        </Button>
      }
    >
      <Campo id="unir-destino" label="Pasar todo a">
        <Select value={destino} onValueChange={setDestino}>
          <SelectTrigger id="unir-destino" className="w-full">
            <SelectValue placeholder="Elegí el cliente que queda…" />
          </SelectTrigger>
          <SelectContent>
            {otros.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
                {c.telefono && <span className="text-tinta-gris"> · {c.telefono}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      {elegido && (
        <Aviso>
          Los {cantidad} movimientos de «{cliente.nombre}» pasan a «{elegido.nombre}» y «{cliente.nombre}» se borra. Sus datos (teléfono, DNI, nota) no se copian: revisalos antes.
        </Aviso>
      )}
    </Ventana>
  );
}
