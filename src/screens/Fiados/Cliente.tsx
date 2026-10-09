import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  Ellipsis,
  FileText,
  HandCoins,
  Merge,
  MessageCircle,
  Pencil,
  ReceiptText,
  Scale,
  ShieldCheck,
  SquareX,
  Trash2,
  Undo2,
  Wallet,
} from 'lucide-react';
import { Confirmar } from '@/components/acciones';
import { EstadoVacio } from '@/components/estado-vacio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfig } from '@/lib/config';
import { cuenta, diaDe, formatoDia, importe, saldosCorridos, type Cargo, type Movimiento } from '@/lib/fiados';
import { useFiados } from '@/lib/fiados-store';
import { formatoCentavos } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { avisarWhatsapp, Dato, detalleMovimiento, estadoDeCuenta, guardarComprobante, recibo, Saldo, vale } from './comun';
import { AjusteDialog, AnularDialog, ClienteDialog, DevolverDialog, PagoDialog, UnirDialog } from './dialogos';

const cronologicoInverso = (a: Movimiento, b: Movimiento) => b.fecha.localeCompare(a.fecha) || b.registrado.localeCompare(a.registrado);

export function ClienteDetalle({ id, onVolver, onCargar, onAbrir }: { id: string; onVolver: () => void; onCargar: (id: string) => void; onAbrir: (id: string) => void }) {
  const { config } = useConfig();
  const { fiados, cambiar } = useFiados();
  const [verAnulados, setVerAnulados] = useState(false);
  const [pago, setPago] = useState(false);
  const [ajuste, setAjuste] = useState<'ajuste' | 'incobrable' | null>(null);
  const [editar, setEditar] = useState(false);
  const [unir, setUnir] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [menu, setMenu] = useState(false);
  const [anular, setAnular] = useState<Movimiento | null>(null);
  const [devolver, setDevolver] = useState<Cargo | null>(null);

  const hoy = diaDe(new Date());
  const cliente = fiados?.clientes.find((c) => c.id === id);
  const movs = useMemo(() => fiados?.movimientos.filter((m) => m.clienteId === id) ?? [], [fiados, id]);
  const k = useMemo(() => cuenta(movs, hoy), [movs, hoy]);
  const saldos = useMemo(() => saldosCorridos(movs), [movs]);
  const anulados = movs.filter((m) => m.anulado).length;
  const lista = [...movs].filter((m) => verAnulados || !m.anulado).sort(cronologicoInverso);
  const pendiente = new Map(k.pendientes.map((p) => [p.id, p.pendiente]));

  // Si el cliente se unió con otro o se borró, se vuelve a la lista.
  useEffect(() => {
    if (fiados && !cliente) onVolver();
  }, [fiados, cliente, onVolver]);
  if (!cliente) return null;

  const accion = (f: () => void) => () => {
    setMenu(false);
    f();
  };
  const marcar = (cambio: { noFiar?: boolean; archivado?: boolean }, mensaje: string) =>
    cambiar((x) => ({ ...x, clientes: x.clientes.map((c) => (c.id === id ? { ...c, ...cambio } : c)) }), mensaje);
  const pdf = (d: Parameters<typeof guardarComprobante>[0]) => void guardarComprobante(d, config.local.carpetaPdf);
  const usoLimite = cliente.limite ? Math.max(0, k.saldo) / cliente.limite : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-8 pt-5 pb-5">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-tinta-media" onClick={onVolver}>
          <ArrowLeft /> Fiados
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] font-bold tracking-tight">{cliente.nombre}</h1>
              {cliente.noFiar && <span className="rounded-full bg-error-suave px-2 py-0.5 text-xs font-semibold text-error">No fiar más</span>}
              {cliente.archivado && <span className="rounded-full bg-gris-claro px-2 py-0.5 text-xs font-semibold text-tinta-media">Archivado</span>}
            </div>
            <p className="tabular mt-0.5 text-sm text-tinta-gris">
              {[cliente.telefono, cliente.dni && `DNI ${cliente.dni}`, cliente.direccion, cliente.referencia && `Ref.: ${cliente.referencia}`].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
            </p>
            {cliente.nota && <p className="mt-1 max-w-2xl font-texto text-sm text-tinta-media">{cliente.nota}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onCargar(id)}>
              <HandCoins /> Cargar fiado
            </Button>
            <Button variant="outline" onClick={() => setPago(true)}>
              <Wallet /> Registrar pago
            </Button>
            <Button variant="outline" onClick={() => avisarWhatsapp(config.local.nombre, cliente, k)} disabled={!cliente.telefono} title={cliente.telefono ? 'Mandarle el saldo por WhatsApp' : 'Sin celular cargado'}>
              <MessageCircle /> WhatsApp
            </Button>
            <Popover open={menu} onOpenChange={setMenu}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Más acciones" title="Más acciones">
                  <Ellipsis />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="grid w-60 gap-0.5 p-1.5">
                <ItemMenu icono={FileText} onClick={accion(() => pdf(estadoDeCuenta(config.local, cliente, movs, k, hoy)))}>
                  Estado de cuenta (PDF)
                </ItemMenu>
                <ItemMenu icono={Scale} onClick={accion(() => setAjuste('ajuste'))}>
                  Ajuste de saldo
                </ItemMenu>
                {k.saldo > 0 && (
                  <ItemMenu icono={SquareX} onClick={accion(() => setAjuste('incobrable'))}>
                    Dar por incobrable
                  </ItemMenu>
                )}
                <ItemMenu icono={Pencil} onClick={accion(() => setEditar(true))}>
                  Editar datos
                </ItemMenu>
                <ItemMenu icono={Merge} onClick={accion(() => setUnir(true))}>
                  Unir con otro cliente
                </ItemMenu>
                <div className="my-1 border-t border-gris-claro" />
                <ItemMenu
                  icono={cliente.noFiar ? ShieldCheck : Ban}
                  onClick={accion(() => marcar({ noFiar: !cliente.noFiar }, cliente.noFiar ? 'Se le puede volver a fiar' : 'Marcado «no fiar más»'))}
                >
                  {cliente.noFiar ? 'Volver a fiarle' : 'No fiar más'}
                </ItemMenu>
                <ItemMenu
                  icono={cliente.archivado ? ArchiveRestore : Archive}
                  onClick={accion(() => marcar({ archivado: !cliente.archivado }, cliente.archivado ? 'Cliente desarchivado' : 'Cliente archivado'))}
                >
                  {cliente.archivado ? 'Desarchivar' : 'Archivar'}
                </ItemMenu>
                {movs.length === 0 && (
                  <ItemMenu icono={Trash2} peligro onClick={accion(() => setBorrar(true))}>
                    Borrar cliente
                  </ItemMenu>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="grid max-w-6xl gap-4">
          {cliente.archivado && k.saldo > 0 && (
            <p className="rounded-lg bg-naranja/12 px-3 py-2 text-sm text-naranja-hondo">Está archivado pero todavía debe: sigue sumando en lo que hay para cobrar.</p>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            <Dato
              titulo={k.saldo < 0 ? 'A favor' : k.saldo > 0 ? 'Debe' : 'Saldo'}
              valor={k.saldo === 0 ? 'Al día' : formatoCentavos(Math.abs(k.saldo))}
              tono={k.saldo < 0 ? 'bien' : undefined}
              detalle={k.ultimoPago ? `Último pago: ${formatoDia(k.ultimoPago)}` : k.saldo > 0 ? 'Todavía no pagó nada' : null}
            />
            <Dato titulo="Debe desde hace" valor={k.antiguedad === null ? '—' : k.antiguedad === 1 ? '1 día' : `${k.antiguedad} días`} detalle="Desde el fiado impago más viejo" />
            {cliente.limite !== null && (
              <Dato
                titulo="Límite"
                valor={formatoCentavos(cliente.limite)}
                tono={usoLimite > 1 ? 'mal' : undefined}
                detalle={
                  <span className="block">
                    <span className="mt-1 block h-1.5 rounded-full bg-gris-claro">
                      <span className={cn('block h-full rounded-full', usoLimite > 1 ? 'bg-error' : 'bg-naranja')} style={{ width: `${Math.min(100, usoLimite * 100)}%` }} />
                    </span>
                    <span className="mt-1 block">Usado {Math.round(usoLimite * 100)} %</span>
                  </span>
                }
              />
            )}
            <Dato titulo="Fiado en total" valor={formatoCentavos(k.fiado)} detalle={k.ganancia > 0 ? `Ganancia estimada ${formatoCentavos(k.ganancia)}` : null} />
          </div>

          <Card className="py-2">
            <CardContent className="px-3">
              <div className="flex items-center justify-between px-2 py-2">
                <p className="text-[15px] font-semibold">Movimientos</p>
                {anulados > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setVerAnulados(!verAnulados)}>
                    {verAnulados ? 'Ocultar anulados' : `Ver anulados (${anulados})`}
                  </Button>
                )}
              </div>
              {lista.length === 0 ? (
                <div className="p-2">
                  <EstadoVacio icono={ReceiptText} titulo="Sin movimientos">
                    Cargá un fiado desde acá o desde Precios de repuestos.
                  </EstadoVacio>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-right">Suma</TableHead>
                      <TableHead className="text-right">Resta</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map((m) => {
                      const imp = importe(m);
                      const queda = pendiente.get(m.id);
                      return (
                        <TableRow key={m.id} className={cn('group/fila', m.anulado && 'text-tinta-gris')}>
                          <TableCell className="tabular align-top whitespace-nowrap">{formatoDia(m.fecha)}</TableCell>
                          <TableCell className="max-w-md align-top whitespace-normal">
                            <p className={cn(m.anulado ? 'line-through' : 'font-medium')}>{detalleMovimiento(m)}</p>
                            <p className="text-xs text-tinta-gris">
                              {[
                                m.tipo === 'cargo' && queda !== undefined && queda < imp && `Le falta pagar ${formatoCentavos(queda)}`,
                                m.tipo !== 'ajuste' && m.nota,
                                m.vendedor && `Atendió ${m.vendedor.nombre}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            {m.anulado && <p className="text-xs font-medium text-error">Anulado: {m.anulado.motivo}</p>}
                          </TableCell>
                          <TableCell className={cn('tabular text-right align-top', m.anulado && 'line-through')}>{imp > 0 ? formatoCentavos(imp) : ''}</TableCell>
                          <TableCell className={cn('tabular text-right align-top', m.anulado ? 'line-through' : 'text-exito')}>{imp < 0 ? formatoCentavos(-imp) : ''}</TableCell>
                          <TableCell className="tabular text-right align-top font-semibold">{m.anulado ? '' : <Saldo saldo={saldos.get(m.id) ?? 0} className="font-semibold" />}</TableCell>
                          <TableCell className="align-top">
                            {!m.anulado && (
                              <div className="flex justify-end gap-0.5 opacity-70 transition-opacity duration-150 group-hover/fila:opacity-100 focus-within:opacity-100">
                                {m.tipo === 'cargo' && (
                                  <>
                                    <Button variant="ghost" size="icon-sm" title="Vale (PDF)" aria-label="Guardar vale en PDF" onClick={() => pdf(vale(config.local, cliente, m))}>
                                      <FileText />
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" title="Devolución" aria-label="Registrar devolución" onClick={() => setDevolver(m)}>
                                      <Undo2 />
                                    </Button>
                                  </>
                                )}
                                {m.tipo === 'pago' && (
                                  <Button variant="ghost" size="icon-sm" title="Recibo (PDF)" aria-label="Guardar recibo en PDF" onClick={() => pdf(recibo(config.local, cliente, m, movs))}>
                                    <FileText />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon-sm" title="Anular" aria-label="Anular movimiento" onClick={() => setAnular(m)} className="hover:bg-error-suave hover:text-error">
                                  <Ban />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <PagoDialog cliente={cliente} k={k} abierto={pago} onCerrar={() => setPago(false)} />
      <AjusteDialog cliente={cliente} k={k} modo={ajuste} onCerrar={() => setAjuste(null)} />
      <ClienteDialog abierto={editar} cliente={cliente} onCerrar={() => setEditar(false)} />
      <UnirDialog cliente={cliente} abierto={unir} onCerrar={() => setUnir(false)} onUnido={onAbrir} />
      <AnularDialog mov={anular} onCerrar={() => setAnular(null)} />
      <DevolverDialog cargo={devolver} onCerrar={() => setDevolver(null)} />
      <Confirmar
        abierto={borrar}
        onCerrar={() => setBorrar(false)}
        titulo="¿Borrar el cliente?"
        accion="Borrar"
        peligro
        onConfirmar={() => cambiar((x) => ({ ...x, clientes: x.clientes.filter((c) => c.id !== id) }), 'Cliente borrado')}
      >
        «{cliente.nombre}» no tiene movimientos. Se borra para siempre.
      </Confirmar>
    </div>
  );
}

function ItemMenu({ icono: Icono, onClick, peligro, children }: { icono: typeof FileText; onClick: () => void; peligro?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors outline-none hover:bg-gris-claro focus-visible:bg-gris-claro',
        peligro ? 'text-error hover:bg-error-suave' : 'text-tinta',
      )}
    >
      <Icono className="size-4 shrink-0" />
      {children}
    </button>
  );
}
