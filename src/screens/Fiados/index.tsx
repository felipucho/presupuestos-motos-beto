import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, HandCoins, MessageCircle, Search, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { EstadoVacio } from '@/components/estado-vacio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfig } from '@/lib/config';
import { csvClientes, diaDe, formatoDia, resumen, totalItems, type Cliente, type Cuenta } from '@/lib/fiados';
import { ARMADO_VACIO, useFiados } from '@/lib/fiados-store';
import { fechaCompacta, formatoCentavos, sinTildes } from '@/lib/formato';
import { guardarCsv } from '@/lib/archivos';
import { enTauri } from '@/lib/entorno';
import { cn } from '@/lib/utils';
import { ClienteDetalle } from './Cliente';
import { Antiguedad, avisarWhatsapp, Dato, mensaje, Saldo } from './comun';
import { CargoDialog, ClienteDialog } from './dialogos';

type Filtro = 'deuda' | 'favor' | 'todos' | 'nofiar' | 'archivados';
type Orden = 'saldo' | 'antiguedad' | 'nombre' | 'pago';

const FILTROS: { id: Filtro; label: string; cumple: (c: Cliente, k: Cuenta) => boolean }[] = [
  { id: 'deuda', label: 'Con deuda', cumple: (c, k) => !c.archivado && k.saldo > 0 },
  { id: 'favor', label: 'A favor', cumple: (_, k) => k.saldo < 0 },
  { id: 'todos', label: 'Todos', cumple: (c) => !c.archivado },
  { id: 'nofiar', label: 'No fiar', cumple: (c) => c.noFiar },
  { id: 'archivados', label: 'Archivados', cumple: (c) => c.archivado },
];

const ORDENES: [Orden, string][] = [
  ['saldo', 'Mayor deuda'],
  ['antiguedad', 'Deuda más vieja'],
  ['nombre', 'Nombre'],
  ['pago', 'Pago más viejo'],
];

type Fila = { c: Cliente; k: Cuenta };
const porNombre = (a: Cliente, b: Cliente) => a.nombre.localeCompare(b.nombre, 'es');
/** Un comparador por orden: agregar uno es sumar una línea acá y otra en ORDENES. */
const COMPARADORES: Record<Orden, (x: Fila, y: Fila) => number> = {
  saldo: (x, y) => y.k.saldo - x.k.saldo || porNombre(x.c, y.c),
  antiguedad: (x, y) => (y.k.antiguedad ?? -1) - (x.k.antiguedad ?? -1) || porNombre(x.c, y.c),
  pago: (x, y) => (x.k.ultimoPago ?? '').localeCompare(y.k.ultimoPago ?? '') || porNombre(x.c, y.c),
  nombre: (x, y) => porNombre(x.c, y.c),
};

export function Fiados({ irARepuestos }: { irARepuestos: () => void }) {
  const { config } = useConfig();
  const { fiados, errorCarga, armado, setArmado, pedirArmado, setPedirArmado } = useFiados();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargo, setCargo] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('deuda');
  const [orden, setOrden] = useState<Orden>('saldo');
  const [busqueda, setBusqueda] = useState('');

  const hoy = diaDe(new Date());
  const r = useMemo(() => fiados && resumen(fiados, hoy), [fiados, hoy]);

  // Al volver de "Terminar fiado" en Precios de repuestos.
  useEffect(() => {
    if (!pedirArmado) return;
    setPedirArmado(false);
    if (armado.clienteId) setAbierto(armado.clienteId);
    setCargo(true);
  }, [pedirArmado, armado.clienteId, setPedirArmado]);

  const cargarA = (id: string) => {
    setArmado((a) => ({ ...a, clienteId: id }));
    setCargo(true);
  };

  const volver = useCallback(() => setAbierto(null), []);

  const filas = useMemo(() => {
    if (!fiados || !r) return [];
    const f = FILTROS.find((x) => x.id === filtro)!;
    const q = sinTildes(busqueda);
    const lista = fiados.clientes
      .map((c) => ({ c, k: r.cuentas.get(c.id)! }))
      .filter(({ c, k }) => (q ? sinTildes(`${c.nombre} ${c.telefono} ${c.dni} ${c.referencia}`).includes(q) : f.cumple(c, k)));
    return lista.sort(COMPARADORES[orden]);
  }, [fiados, r, filtro, busqueda, orden]);

  const exportar = async () => {
    if (!fiados || !r) return;
    if (!enTauri) return void toast.info('Disponible sólo en la app de escritorio');
    try {
      const ruta = await guardarCsv(csvClientes(filas.map((x) => x.c), r.cuentas), `fiados-${fechaCompacta(new Date())}.csv`);
      if (ruta) toast.success('Lista exportada', { description: ruta });
    } catch (e) {
      toast.error('No se pudo exportar', { description: mensaje(e) });
    }
  };

  const dialogos = (
    <>
      <CargoDialog abierto={cargo} onCerrar={() => setCargo(false)} irARepuestos={irARepuestos} onCargado={setAbierto} />
      <ClienteDialog abierto={nuevo} cliente={null} onCerrar={() => setNuevo(false)} onGuardado={setAbierto} />
    </>
  );

  if (errorCarga) {
    return (
      <div className="grid h-full place-items-center p-8">
        <EstadoVacio icono={TriangleAlert} titulo="No se pudieron leer los fiados">
          {errorCarga}. No cargues nada hasta resolverlo: cerrá y volvé a abrir la app.
        </EstadoVacio>
      </div>
    );
  }
  if (!fiados || !r) return null;

  if (abierto) {
    return (
      <>
        <ClienteDetalle id={abierto} onVolver={volver} onCargar={cargarA} onAbrir={setAbierto} />
        {dialogos}
      </>
    );
  }

  const cantidad = (f: (typeof FILTROS)[number]) => fiados.clientes.filter((c) => f.cumple(c, r.cuentas.get(c.id)!)).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 px-8 pt-7 pb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Fiados</h1>
          <p className="mt-0.5 text-sm text-tinta-gris">Cuenta corriente de los clientes: lo que se llevaron, lo que pagaron y lo que deben. Precios fijos en pesos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void exportar()} disabled={filas.length === 0} title="Exporta la lista que se ve, para abrir en Excel">
            <Download /> Exportar
          </Button>
          <Button variant="outline" onClick={() => setNuevo(true)}>
            <UserPlus /> Nuevo cliente
          </Button>
          <Button onClick={() => setCargo(true)}>
            <HandCoins /> Cargar fiado
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="grid max-w-6xl gap-4">
          {armado.items.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-naranja/40 bg-naranja/8 px-4 py-3">
              <HandCoins className="size-5 shrink-0 text-naranja" />
              <p className="flex-1 text-sm">
                Hay un fiado sin terminar: {armado.items.length} {armado.items.length === 1 ? 'artículo' : 'artículos'} por{' '}
                <b className="tabular">{formatoCentavos(totalItems(armado.items))}</b>.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setArmado(ARMADO_VACIO)}>
                Descartar
              </Button>
              <Button size="sm" onClick={() => setCargo(true)}>
                Continuar
              </Button>
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <Dato titulo="Para cobrar" valor={formatoCentavos(r.aCobrar)} detalle={`${r.deudores} ${r.deudores === 1 ? 'cliente debe' : 'clientes deben'}`} />
            <Dato titulo="Cobrado este mes" valor={formatoCentavos(r.cobradoMes)} tono={r.cobradoMes > 0 ? 'bien' : undefined} />
            {r.aFavor > 0 && <Dato titulo="A favor de clientes" valor={formatoCentavos(r.aFavor)} detalle="Pagaron de más" />}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Filtro" className="flex w-fit flex-wrap rounded-lg bg-gris-claro/70 p-1">
              {FILTROS.map((f) => {
                const n = cantidad(f);
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={!busqueda && filtro === f.id}
                    onClick={() => {
                      setFiltro(f.id);
                      setBusqueda('');
                    }}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
                      !busqueda && filtro === f.id ? 'bg-papel-alto text-tinta shadow-xs ring-1 ring-gris-plano' : 'text-tinta-media hover:text-tinta',
                    )}
                  >
                    {f.label}
                    {n > 0 && <span className="tabular text-xs text-tinta-gris">{n}</span>}
                  </button>
                );
              })}
            </div>
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tinta-gris" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en todos: nombre, teléfono, DNI…" aria-label="Buscar cliente" className="h-9 pl-8" />
            </div>
            <Select value={orden} onValueChange={(v) => setOrden(v as Orden)}>
              <SelectTrigger className="h-9 w-44" aria-label="Ordenar por">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDENES.map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fiados.clientes.length === 0 ? (
            <EstadoVacio
              icono={Users}
              titulo="Todavía no hay clientes con fiado"
              accion={
                <Button onClick={() => setNuevo(true)}>
                  <UserPlus /> Nuevo cliente
                </Button>
              }
            >
              Creá el cliente y cargale lo que se lleva, o fiá directo desde Precios de repuestos con el botón de la mano.
            </EstadoVacio>
          ) : filas.length === 0 ? (
            <p className="py-8 text-center text-sm text-tinta-gris">{busqueda ? 'Nadie coincide con la búsqueda.' : 'No hay clientes en este filtro.'}</p>
          ) : (
            <Card className="py-2">
              <CardContent className="px-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Debe desde</TableHead>
                      <TableHead>Último pago</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map(({ c, k }) => (
                      <TableRow
                        key={c.id}
                        tabIndex={0}
                        aria-label={`Abrir cuenta de ${c.nombre}`}
                        onClick={() => setAbierto(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && setAbierto(c.id)}
                        className={cn('group/fila cursor-pointer', c.archivado && 'text-tinta-gris')}
                      >
                        <TableCell>
                          <p className="font-medium">
                            {c.nombre}
                            {c.noFiar && <span className="ml-2 rounded-full bg-error-suave px-1.5 py-0.5 text-[11px] font-semibold text-error">No fiar</span>}
                            {c.archivado && <span className="ml-2 rounded-full bg-gris-claro px-1.5 py-0.5 text-[11px] font-semibold text-tinta-media">Archivado</span>}
                          </p>
                          <p className="tabular text-xs text-tinta-gris">{[c.telefono, c.dni && `DNI ${c.dni}`].filter(Boolean).join(' · ')}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Saldo saldo={k.saldo} className="font-semibold" />
                          {c.limite !== null && k.saldo > c.limite && <p className="text-xs font-medium text-error">Pasó el límite</p>}
                        </TableCell>
                        <TableCell>
                          <Antiguedad dias={k.antiguedad} />
                        </TableCell>
                        <TableCell className="tabular text-tinta-media">{k.ultimoPago ? formatoDia(k.ultimoPago) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {c.telefono && k.saldo !== 0 && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Mandarle el saldo a ${c.nombre} por WhatsApp`}
                              title="Mandar saldo por WhatsApp"
                              className="opacity-70 group-hover/fila:opacity-100 focus-visible:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                avisarWhatsapp(config.local.nombre, c, k);
                              }}
                            >
                              <MessageCircle />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {dialogos}
    </div>
  );
}
