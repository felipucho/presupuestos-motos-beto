import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  HandCoins,
  KeyRound,
  LoaderCircle,
  LogIn,
  PackageSearch,
  Search,
  Settings2,
  ShoppingCart,
  TriangleAlert,
  X,
} from 'lucide-react';
import { EstadoVacio } from '@/components/estado-vacio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IVA_POR_DEFECTO, LoginFallido, ORDENES, costoConIva, precioConIva, SinSesion, type Accion, type Articulo, type Ficha } from '@/lib/cba';
import { useBusqueda, type Estado } from '@/lib/busqueda-cba';
import type { Proveedor } from '@/lib/proveedores';
import { useConfig } from '@/lib/config';
import { aCentavos, totalItems, type Item } from '@/lib/fiados';
import { ARMADO_VACIO, useFiados } from '@/lib/fiados-store';
import { formatoCentavos } from '@/lib/formato';
import { cn } from '@/lib/utils';

/** Mismos centavos que se cargan al fiar: lo que se ve en pantalla es lo que queda guardado. */
const enCentavos = (pesos: number) => formatoCentavos(aCentavos(pesos));

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ítem de fiado con los precios del día: venta con IVA y costo con bonificación e IVA. */
const itemDe = (a: Articulo, iva: number): Item => ({
  codigo: a.codigo,
  detalle: a.detalle,
  cantidad: 1,
  precio: aCentavos(precioConIva(a.lista, iva)),
  costo: aCentavos(costoConIva(a.lista, a.bonif, iva)),
});

export function Repuestos({ proveedor: p, irAFiados, irAConfig }: { proveedor: Proveedor; irAFiados: () => void; irAConfig: () => void }) {
  const abrirPagina = (a: Articulo) => void p.abrir(a).catch((e: unknown) => toast.error('No se pudo abrir la página', { description: mensaje(e) }));
  const { config } = useConfig();
  const { fiados, armado, setArmado, agregarAlArmado, setPedirArmado } = useFiados();
  const clienteArmado = fiados?.clientes.find((c) => c.id === armado.clienteId);

  // Sólo local: nunca toca el carrito ni los pedidos de la cuenta en el proveedor.
  const fiar = (a: Articulo) => {
    agregarAlArmado(itemDe(a, iva));
    toast.success('Agregado al fiado', { description: a.detalle, duration: 2500 });
  };

  const terminarFiado = () => {
    setPedirArmado(true);
    irAFiados();
  };
  const iva = config.ivaProveedores[p.id] ?? IVA_POR_DEFECTO;
  const [texto, setTexto] = useState('');
  const [ficha, setFicha] = useState<Articulo | null>(null);
  const [verCosto, setVerCosto] = useState(false);
  // Código que se está sumando al carrito: de a uno, para no pisar cantidades en el sitio.
  const [sumando, setSumando] = useState<string | null>(null);
  const { estado, buscar, accion, mostrarError, ultima } = useBusqueda(p);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (t.length >= 2) void buscar(t);
  };

  const abrirLogin = () => p.login().catch((e: unknown) => mostrarError(`No se pudo abrir el login: ${String(e)}`));

  // Carrito de la cuenta en el sitio del proveedor: no compra, el pedido se confirma en la página.
  const sumarAlCarrito = async (a: Articulo, cantidad: number) => {
    if (!p.agregarAlCarrito || sumando) return;
    setSumando(a.codigo);
    try {
      await p.agregarAlCarrito(a, cantidad);
      toast.success(`Agregado al carrito de ${p.nombreCorto}`, { description: `${cantidad} × ${a.detalle}`, duration: 2500 });
    } catch (e) {
      const sinSesion = e instanceof SinSesion || e instanceof LoginFallido;
      toast.error('No se pudo agregar al carrito', {
        description: sinSesion ? (e as Error).message || `Hay que iniciar sesión en ${p.nombreCorto}.` : mensaje(e),
        action: sinSesion ? { label: 'Entrar a mano', onClick: () => void abrirLogin() } : undefined,
      });
    } finally {
      setSumando(null);
    }
  };
  const alCarrito = p.agregarAlCarrito && ((a: Articulo, cantidad = 1) => void sumarAlCarrito(a, cantidad));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-8 pt-7 pb-5">
        <h1 className="text-[22px] font-bold tracking-tight">Precios de repuestos</h1>
        <p className="mt-0.5 text-sm text-tinta-gris">
          {p.nombreCorto} · IVA {iva.toLocaleString('es-AR')} %
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="max-w-6xl">
          <form onSubmit={enviar} className="mb-5 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-gris" />
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar repuesto" className="h-10 pl-9" autoFocus />
            </div>
            <Button type="submit" className="h-10 px-5" disabled={texto.trim().length < 2 || estado.tipo === 'buscando'}>
              {estado.tipo === 'buscando' ? <LoaderCircle className="animate-spin" /> : <Search />} Buscar
            </Button>
          </form>

          {estado.tipo === 'buscando' && <p className="py-10 text-center text-sm text-tinta-gris">Buscando en {p.nombreCorto}…</p>}

          {estado.tipo === 'sin-sesion' && (
            <EstadoVacio
              icono={estado.rechazo ? KeyRound : LogIn}
              titulo={estado.rechazo ? `No se pudo entrar solo a ${p.nombreCorto}` : `Hay que iniciar sesión en ${p.nombreCorto}`}
              accion={
                <div className="flex gap-2">
                  <Button onClick={abrirLogin}>
                    <LogIn /> Entrar a mano
                  </Button>
                  <Button variant="outline" onClick={irAConfig}>
                    <Settings2 /> {estado.rechazo ? 'Revisar la cuenta' : 'Guardar la cuenta'}
                  </Button>
                </div>
              }
            >
              {estado.rechazo && <span className="mb-2 block font-semibold text-tinta">{estado.rechazo}</span>}
            </EstadoVacio>
          )}

          {estado.tipo === 'error' && (
            <EstadoVacio
              icono={TriangleAlert}
              titulo="No se pudo buscar"
              accion={
                ultima && (
                  <Button variant="outline" onClick={() => void buscar(ultima)}>
                    Reintentar
                  </Button>
                )
              }
            >
              {estado.mensaje}
            </EstadoVacio>
          )}

          {estado.tipo === 'ok' &&
            (estado.resultado.articulos.length === 0 ? (
              <EstadoVacio icono={PackageSearch} titulo="Sin resultados">
                No se encontró nada para «{estado.busqueda}».
              </EstadoVacio>
            ) : (
              <Listado
                estado={estado}
                iva={iva}
                conOrden={!!p.accion}
                verCosto={verCosto}
                onVerCosto={() => setVerCosto((v) => !v)}
                sumando={sumando}
                onAccion={(a) => void accion(a)}
                onFicha={setFicha}
                onFiar={fiar}
                onCarrito={alCarrito}
                onAbrir={abrirPagina}
              />
            ))}
        </div>
      </div>

      {armado.items.length > 0 && (
        <div className="flex items-center gap-4 border-t border-gris-plano bg-papel-alto px-8 py-3" role="region" aria-label="Fiado en armado">
          <HandCoins className="size-5 shrink-0 text-naranja" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Fiado{clienteArmado ? ` para ${clienteArmado.nombre}` : ''}:</span> {armado.items.reduce((a, i) => a + i.cantidad, 0)}{' '}
            {armado.items.reduce((a, i) => a + i.cantidad, 0) === 1 ? 'artículo' : 'artículos'} ·{' '}
            <span className="tabular font-semibold">{formatoCentavos(totalItems(armado.items))}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => setArmado(ARMADO_VACIO)}>
            <X /> Descartar
          </Button>
          <Button onClick={terminarFiado}>Terminar fiado</Button>
        </div>
      )}

      <FichaArticulo
        proveedor={p}
        articulo={ficha}
        iva={iva}
        verCosto={verCosto}
        sumando={sumando}
        onCerrar={() => setFicha(null)}
        onFiar={fiar}
        onCarrito={alCarrito}
        onAbrir={abrirPagina}
      />
    </div>
  );
}

function Listado({
  estado,
  iva,
  conOrden,
  verCosto,
  onVerCosto,
  sumando,
  onAccion,
  onFicha,
  onFiar,
  onCarrito,
  onAbrir,
}: {
  estado: Extract<Estado, { tipo: 'ok' }>;
  iva: number;
  conOrden: boolean;
  verCosto: boolean;
  onVerCosto: () => void;
  sumando: string | null;
  onAccion: (a: Accion) => void;
  onFicha: (a: Articulo) => void;
  onFiar: (a: Articulo) => void;
  onCarrito?: (a: Articulo) => void;
  onAbrir: (a: Articulo) => void;
}) {
  const { resultado, pagina, cargando } = estado;
  const paginas = Math.max(1, Math.ceil(resultado.total / resultado.porPagina));

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-tinta-gris">
          {resultado.total.toLocaleString('es-AR')} {resultado.total === 1 ? 'artículo' : 'artículos'}
          {!conOrden && resultado.total > resultado.articulos.length && ` · se muestran los primeros ${resultado.articulos.length}, afiná la búsqueda`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onVerCosto} aria-pressed={verCosto} title={verCosto ? 'Ocultar el costo' : 'Ver el costo'}>
            {verCosto ? <EyeOff /> : <Eye />} Costo
          </Button>
          {conOrden && (
            <Select value={String(resultado.orden)} onValueChange={(v) => onAccion({ tipo: 'orden', valor: Number(v) })} disabled={cargando}>
              <SelectTrigger className="w-48" aria-label="Ordenar por">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDENES.map(([valor, nombre]) => (
                  <SelectItem key={valor} value={String(valor)}>
                    {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <Card className={cn('py-2 transition-opacity', cargando && 'pointer-events-none opacity-50')} aria-busy={cargando}>
        <CardContent className="px-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24" />
                <TableHead>Artículo</TableHead>
                <TableHead>Stock</TableHead>
                {verCosto && <TableHead className="text-right">Bonif.</TableHead>}
                {verCosto && <TableHead className="text-right">Costo c/IVA</TableHead>}
                <TableHead className="text-right">Venta c/IVA</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.articulos.map((a) => (
                <TableRow
                  key={a.codigo}
                  tabIndex={0}
                  aria-label={`Ver ficha de ${a.detalle}`}
                  onClick={() => onFicha(a)}
                  onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onFicha(a)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <img src={a.imagen} alt="" loading="lazy" draggable={false} className="size-20 rounded-md bg-white object-contain ring-1 ring-gris-claro" />
                  </TableCell>
                  <TableCell className="min-w-72 whitespace-normal">
                    <p className="font-medium">{a.detalle}</p>
                    <p className="tabular mt-0.5 text-xs text-tinta-gris">{[a.codigo, a.unidad, a.empaque && `Empaque: ${a.empaque}`].filter(Boolean).join(' · ')}</p>
                    {a.infoAdicional && <p className="mt-1 line-clamp-2 font-texto text-xs text-tinta-media">{a.infoAdicional}</p>}
                  </TableCell>
                  <TableCell>
                    <Stock articulo={a} />
                  </TableCell>
                  {verCosto && <TableCell className="tabular text-right text-tinta-media">{a.bonif.toLocaleString('es-AR')} %</TableCell>}
                  {verCosto && <TableCell className="tabular text-right text-tinta-media">{enCentavos(costoConIva(a.lista, a.bonif, iva))}</TableCell>}
                  <TableCell className="tabular text-right text-base font-semibold">{enCentavos(precioConIva(a.lista, iva))}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFiar(a);
                      }}
                      aria-label={`Fiar ${a.detalle}`}
                      title="Fiar"
                    >
                      <HandCoins />
                    </Button>
                    {onCarrito && a.carrito && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={sumando !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCarrito(a);
                        }}
                        aria-label={`Agregar ${a.detalle} al carrito`}
                        title="Agregar 1 al carrito"
                      >
                        {sumando === a.codigo ? <LoaderCircle className="animate-spin" /> : <ShoppingCart />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAbrir(a);
                      }}
                      aria-label="Abrir en la página"
                      title="Abrir en la página"
                    >
                      <ExternalLink />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {conOrden && paginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => onAccion({ tipo: 'anterior' })} disabled={cargando || pagina <= 1}>
            <ChevronLeft /> Anterior
          </Button>
          <span className="tabular min-w-28 text-center text-sm text-tinta-media">
            {cargando ? <LoaderCircle className="mx-auto size-4 animate-spin" /> : `Página ${pagina} de ${paginas}`}
          </span>
          <Button variant="outline" onClick={() => onAccion({ tipo: 'siguiente' })} disabled={cargando || pagina >= paginas}>
            Siguiente <ChevronRight />
          </Button>
        </div>
      )}
    </>
  );
}

/** Semáforo de stock como lo muestra el sitio. */
function Stock({ articulo }: { articulo: Articulo }) {
  const [clase, texto] =
    articulo.stock === 'disponible'
      ? ['bg-exito-suave text-exito', articulo.estado]
      : articulo.stock === 'bajostock'
        ? ['bg-naranja/15 text-naranja-hondo', 'Stock bajo']
        : ['bg-gris-claro text-tinta-media', articulo.estado];
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', clase)}>{texto}</span>;
}

function FichaArticulo({
  proveedor: p,
  articulo,
  iva,
  verCosto,
  sumando,
  onCerrar,
  onFiar,
  onCarrito,
  onAbrir,
}: {
  proveedor: Proveedor;
  articulo: Articulo | null;
  iva: number;
  verCosto: boolean;
  sumando: string | null;
  onCerrar: () => void;
  onFiar: (a: Articulo) => void;
  onCarrito?: (a: Articulo, cantidad: number) => void;
  onAbrir: (a: Articulo) => void;
}) {
  const [cantidad, setCantidad] = useState(1);
  useEffect(() => setCantidad(1), [articulo]);
  const [ficha, setFicha] = useState<Ficha | 'cargando' | 'sin-sesion' | { error: string }>('cargando');

  useEffect(() => {
    if (!articulo || !p.ficha) return;
    let vigente = true;
    setFicha('cargando');
    p.ficha(articulo.codigo)
      .then((f) => vigente && setFicha(f))
      .catch((e: unknown) => vigente && setFicha(e instanceof SinSesion ? 'sin-sesion' : { error: mensaje(e) }));
    return () => {
      vigente = false;
    };
  }, [articulo, p]);

  return (
    <Dialog open={articulo !== null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-3xl">
        {articulo && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 leading-snug">{articulo.detalle}</DialogTitle>
              <DialogDescription className="tabular">
                {[articulo.codigo, articulo.unidad, articulo.empaque && `Empaque: ${articulo.empaque}`].filter(Boolean).join(' · ')}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <img src={articulo.imagen} alt={articulo.detalle} draggable={false} className="aspect-square w-full rounded-lg bg-white object-contain ring-1 ring-gris-claro" />

              <div className="grid content-start gap-4">
                <div className="flex items-center gap-2">
                  <Stock articulo={articulo} />
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {verCosto && (
                    <>
                      <dt className="text-tinta-gris">Bonificación</dt>
                      <dd className="tabular text-right">{articulo.bonif.toLocaleString('es-AR')} %</dd>
                      <dt className="text-tinta-gris">Costo c/IVA</dt>
                      <dd className="tabular text-right">{enCentavos(costoConIva(articulo.lista, articulo.bonif, iva))}</dd>
                    </>
                  )}
                  <dt className="font-medium">Venta c/IVA {iva.toLocaleString('es-AR')} %</dt>
                  <dd className="tabular text-right text-base font-semibold">{enCentavos(precioConIva(articulo.lista, iva))}</dd>
                </dl>

                {articulo.infoAdicional && <p className="font-texto text-sm whitespace-pre-line text-tinta-media">{articulo.infoAdicional}</p>}

                {p.ficha && (
                  <div>
                    <p className="mb-1.5 text-sm font-semibold">Características</p>
                    {ficha === 'cargando' ? (
                      <LoaderCircle className="size-4 animate-spin text-tinta-gris" />
                    ) : ficha === 'sin-sesion' ? (
                      <p className="text-sm text-tinta-gris">Hay que iniciar sesión en {p.nombreCorto}.</p>
                    ) : 'error' in ficha ? (
                      <p className="text-sm text-error">{ficha.error}</p>
                    ) : ficha.caracteristicas.length === 0 ? (
                      <p className="text-sm text-tinta-gris">El sitio no informa características.</p>
                    ) : (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        {ficha.caracteristicas.map(([nombre, valor]) => (
                          <div key={nombre + valor} className="contents">
                            <dt className="text-tinta-gris">{nombre}</dt>
                            <dd>{valor}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => onFiar(articulo)}>
                    <HandCoins /> Fiar
                  </Button>
                  {onCarrito && articulo.carrito && (
                    <div className="flex">
                      <Input
                        type="number"
                        min={1}
                        value={cantidad}
                        onChange={(e) => setCantidad(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                        aria-label="Cantidad para el carrito"
                        className="h-9 w-16 rounded-r-none text-center"
                      />
                      <Button variant="outline" className="rounded-l-none border-l-0" disabled={sumando !== null} onClick={() => onCarrito(articulo, cantidad)}>
                        {sumando === articulo.codigo ? <LoaderCircle className="animate-spin" /> : <ShoppingCart />} Al carrito
                      </Button>
                    </div>
                  )}
                  <Button variant="outline" onClick={() => onAbrir(articulo)}>
                    <ExternalLink /> Abrir en la página
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
