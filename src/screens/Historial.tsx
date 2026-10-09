import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, FileText, History, Search, Trash2 } from 'lucide-react';
import { Confirmar } from '@/components/acciones';
import { EstadoVacio } from '@/components/estado-vacio';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatoMoneda, formatoNumero } from '@/lib/formato';
import { borrarRegistro, cargarHistorial, type Registro } from '@/lib/historial';
import { enTramo, metricas, mover, rango, tramos, type Periodo } from '@/lib/metricas';
import { abrirArchivo } from '@/lib/storage';
import { cn } from '@/lib/utils';

const PERIODOS: { id: Periodo; label: string; anterior: string }[] = [
  { id: 'dia', label: 'Día', anterior: 'el día anterior' },
  { id: 'semana', label: 'Semana', anterior: 'la semana anterior' },
  { id: 'mes', label: 'Mes', anterior: 'el mes anterior' },
  { id: 'trimestre', label: 'Trimestre', anterior: 'el trimestre anterior' },
  { id: 'anio', label: 'Año', anterior: 'el año anterior' },
  { id: 'todo', label: 'Histórico', anterior: '' },
];

const MAX_FILAS = 200;

const hora = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');

export function Historial() {
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [ref, setRef] = useState(() => new Date());
  const [busqueda, setBusqueda] = useState('');
  const [borrando, setBorrando] = useState<Registro | null>(null);

  useEffect(() => {
    cargarHistorial()
      .then(({ registros, aviso }) => {
        setRegistros(registros);
        if (aviso) toast.error('Historial dañado', { description: aviso, duration: Infinity });
      })
      .catch((e: unknown) => {
        setRegistros([]);
        toast.error('No se pudo leer el historial', { description: String(e), duration: Infinity });
      });
  }, []);

  const hoy = new Date();
  const actual = rango(periodo, ref);
  const esActual = periodo === 'todo' || actual?.desde.getTime() === rango(periodo, hoy)?.desde.getTime();
  const info = PERIODOS.find((p) => p.id === periodo)!;

  const datos = useMemo(() => {
    const todos = registros ?? [];
    const enPeriodo = todos.filter((r) => enTramo(r, rango(periodo, ref)));
    const anterior = periodo === 'todo' ? null : metricas(todos.filter((r) => enTramo(r, rango(periodo, mover(periodo, ref, -1)))));
    const primero = todos[0] ? new Date(todos[0].fecha) : null;
    const barras = tramos(periodo, ref, primero, new Date()).map((t) => ({ ...t, cantidad: enPeriodo.filter((r) => enTramo(r, t)).length }));
    return { enPeriodo, m: metricas(enPeriodo), anterior, barras };
  }, [registros, periodo, ref]);

  const filas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    const lista = [...datos.enPeriodo].reverse();
    if (!q) return lista;
    return lista.filter((r) =>
      sinTildes([r.numero, r.cliente.nombre, r.cliente.telefono, r.vendedor?.nombre ?? '', ...r.motos.map((m) => `${m.marca} ${m.modelo} ${m.color}`)].join(' ')).includes(q),
    );
  }, [datos.enPeriodo, busqueda]);

  const abrir = (r: Registro) =>
    void abrirArchivo(r.archivo).catch(() => toast.error('No se encontró el PDF', { description: `Puede que se haya movido o borrado: ${r.archivo}` }));

  const borrar = (r: Registro) => {
    setBorrando(null);
    borrarRegistro(r.id)
      .then(() => {
        setRegistros((x) => x?.filter((y) => y.id !== r.id) ?? null);
        toast.success('Presupuesto sacado del historial');
      })
      .catch((e: unknown) => toast.error('No se pudo borrar', { description: String(e) }));
  };

  const { m, anterior } = datos;
  const diferencia = anterior ? m.presupuestos - anterior.presupuestos : null;
  const maxBarra = Math.max(1, ...datos.barras.map((b) => b.cantidad));
  const unidad =
    periodo === 'semana' || periodo === 'mes' ? 'día' : periodo === 'trimestre' ? 'semana' : periodo === 'anio' || !/^\d{4}$/.test(datos.barras[0]?.etiqueta ?? '') ? 'mes' : 'año';
  // Con muchas barras se rotulan una de cada cinco, más la primera y la última.
  const rotular = (i: number) => datos.barras.length <= 16 || i === 0 || i === datos.barras.length - 1 || (i + 1) % 5 === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-8 pt-7 pb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Métricas</h1>
          <p className="mt-0.5 text-sm text-tinta-gris">Cada PDF que se guarda queda anotado acá: a quién, qué moto y quién lo hizo.</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="grid gap-4">
          {/* A la izquierda: arriba a la derecha las tapan los avisos. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div role="tablist" aria-label="Período" className="flex w-fit rounded-lg bg-gris-claro/70 p-1">
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={periodo === p.id}
                  onClick={() => {
                    setPeriodo(p.id);
                    setRef(new Date());
                  }}
                  className={cn(
                    'h-8 rounded-md px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
                    periodo === p.id ? 'bg-papel-alto text-tinta shadow-xs ring-1 ring-gris-plano' : 'text-tinta-media hover:text-tinta',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {periodo !== 'todo' && (
                <Button variant="outline" size="icon-sm" aria-label="Período anterior" title="Período anterior" onClick={() => setRef(mover(periodo, ref, -1))}>
                  <ChevronLeft />
                </Button>
              )}
              <h2 className="min-w-0 text-lg font-bold tracking-tight">{actual?.etiqueta ?? 'Desde el primer presupuesto'}</h2>
              {periodo !== 'todo' && (
                <Button variant="outline" size="icon-sm" aria-label="Período siguiente" title="Período siguiente" disabled={esActual} onClick={() => setRef(mover(periodo, ref, 1))}>
                  <ChevronRight />
                </Button>
              )}
              {!esActual && (
                <Button variant="ghost" size="sm" onClick={() => setRef(new Date())}>
                  Volver al actual
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
            <Dato
              titulo="Presupuestos"
              valor={formatoNumero(m.presupuestos)}
              detalle={
                diferencia === null ? null : diferencia === 0 ? `Igual que ${info.anterior}` : `${diferencia > 0 ? '+' : '−'}${formatoNumero(Math.abs(diferencia))} que ${info.anterior}`
              }
              tono={diferencia === null || diferencia === 0 ? undefined : diferencia > 0 ? 'bien' : 'mal'}
            />
            <Dato titulo="Motos presupuestadas" valor={formatoNumero(m.motos)} />
            <Dato titulo="Clientes" valor={formatoNumero(m.clientes)} detalle={m.clientesRepetidos > 0 ? `${formatoNumero(m.clientesRepetidos)} pidieron más de una vez` : null} />
            <Dato titulo="Total presupuestado" valor={formatoMoneda(m.monto)} detalle="Suma de precios de lista" />
            <Dato titulo="Precio promedio" valor={formatoMoneda(m.promedioMoto)} detalle="Por moto" />
          </div>

          <div className={cn('grid gap-4', datos.barras.length > 0 && 'lg:grid-cols-[1.6fr_1fr]')}>
            {datos.barras.length > 0 && (
              <Bloque titulo={`Presupuestos por ${unidad}`}>
                <div className="flex h-44 items-end gap-[3px]" role="img" aria-label="Gráfico de presupuestos">
                  {datos.barras.map((b, i) => (
                    <div key={b.desde.getTime()} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${b.etiqueta}: ${b.cantidad}`}>
                      {b.cantidad > 0 && <span className="tabular text-[10px] font-semibold text-tinta-media">{b.cantidad}</span>}
                      <div
                        className={cn('w-full max-w-9 rounded-t-[3px]', b.cantidad > 0 ? 'bg-naranja' : 'bg-gris-claro')}
                        style={{ height: b.cantidad > 0 ? `${(b.cantidad / maxBarra) * 82}%` : 2 }}
                      />
                      <span className="tabular h-3.5 truncate text-[10px] leading-3.5 text-tinta-gris">{rotular(i) ? b.etiqueta : ''}</span>
                    </div>
                  ))}
                </div>
              </Bloque>
            )}
            <div className="grid gap-4">
              <Bloque titulo="Por vendedor">
                {m.porVendedor.length === 0 ? (
                  <Vacio />
                ) : (
                  <ul className="grid gap-3">
                    {m.porVendedor.map((v) => (
                      <li key={v.nombre}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate font-medium">{v.nombre}</span>
                          <span className="tabular shrink-0 text-tinta-media">
                            {v.presupuestos} · {formatoMoneda(v.monto)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-gris-claro">
                          <div className="h-full rounded-full bg-naranja" style={{ width: `${(v.presupuestos / m.presupuestos) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloque>
              <Bloque titulo="Motos más pedidas">
                {m.topMotos.length === 0 ? (
                  <Vacio />
                ) : (
                  <ol className="grid gap-1.5 text-sm">
                    {m.topMotos.map((t, i) => (
                      <li key={t.nombre} className="flex items-baseline gap-2">
                        <span className="tabular w-4 text-tinta-gris">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{t.nombre}</span>
                        <span className="tabular text-tinta-media">{t.veces === 1 ? '1 vez' : `${t.veces} veces`}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Bloque>
            </div>
          </div>

          <Bloque
            titulo="Presupuestos"
            extra={
              <div className="relative w-72">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tinta-gris" />
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente, moto, vendedor…" aria-label="Buscar" className="h-9 pl-8" />
              </div>
            }
          >
            {registros === null ? null : registros.length === 0 ? (
              <EstadoVacio icono={History} titulo="Todavía no hay presupuestos">
                Cuando guardes un PDF desde «Nuevo presupuesto», aparece acá.
              </EstadoVacio>
            ) : filas.length === 0 ? (
              <p className="py-6 text-center text-sm text-tinta-gris">{busqueda ? 'Nada coincide con la búsqueda.' : 'No hay presupuestos en este período.'}</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Moto</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Precio de lista</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.slice(0, MAX_FILAS).map((r) => (
                      <TableRow key={r.id} className="group/fila">
                        <TableCell className="tabular align-top text-tinta-media">
                          {hora(r.fecha)}
                          <span className="block text-xs text-tinta-gris">{r.numero}</span>
                        </TableCell>
                        <TableCell className="align-top">
                          <span className="font-medium">{r.cliente.nombre}</span>
                          {r.cliente.telefono && <span className="tabular block text-xs text-tinta-gris">{r.cliente.telefono}</span>}
                        </TableCell>
                        <TableCell className="align-top">
                          {r.motos.map((x, i) => (
                            <span key={i} className="block">
                              {x.marca} {x.modelo}
                              {x.color && <span className="text-tinta-gris"> · {x.color}</span>}
                            </span>
                          ))}
                        </TableCell>
                        <TableCell className="align-top text-tinta-media">{r.vendedor?.nombre ?? '—'}</TableCell>
                        <TableCell className="tabular text-right align-top">
                          {r.motos.map((x, i) => (
                            <span key={i} className="block">
                              {formatoMoneda(x.precioLista)}
                            </span>
                          ))}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex justify-end gap-0.5 opacity-70 transition-opacity duration-150 group-hover/fila:opacity-100 focus-within:opacity-100">
                            <Button variant="ghost" size="icon-sm" aria-label={`Abrir PDF de ${r.cliente.nombre}`} title="Abrir PDF" onClick={() => abrir(r)}>
                              <FileText />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Sacar del historial ${r.numero}`}
                              title="Sacar del historial"
                              onClick={() => setBorrando(r)}
                              className="hover:bg-error-suave hover:text-error"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filas.length > MAX_FILAS && (
                  <p className="pt-3 text-center text-xs text-tinta-gris">
                    Se muestran los {MAX_FILAS} más nuevos de {formatoNumero(filas.length)}. Buscá o elegí un período más corto para ver el resto.
                  </p>
                )}
              </>
            )}
          </Bloque>
        </div>
      </div>

      <Confirmar
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo="¿Sacar del historial?"
        accion="Sacar del historial"
        peligro
        onConfirmar={() => borrando && borrar(borrando)}
      >
        El presupuesto {borrando?.numero} de {borrando?.cliente.nombre} deja de contar en las métricas. El PDF no se borra.
      </Confirmar>
    </div>
  );
}

function Dato({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string | null; tono?: 'bien' | 'mal' }) {
  return (
    <Card className="gap-1 px-4 py-4">
      <p className="text-xs font-medium text-tinta-gris">{titulo}</p>
      <p className="tabular truncate text-[22px] font-bold tracking-tight" title={valor}>{valor}</p>
      {detalle && <p className={cn('text-xs', tono === 'bien' ? 'font-medium text-exito' : tono === 'mal' ? 'font-medium text-error' : 'text-tinta-gris')}>{detalle}</p>}
    </Card>
  );
}

function Bloque({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="flex items-center justify-between gap-4 px-5">
        <CardTitle className="text-[15px]">{titulo}</CardTitle>
        {extra}
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

const Vacio = () => <p className="text-sm text-tinta-gris">Sin presupuestos en este período.</p>;
