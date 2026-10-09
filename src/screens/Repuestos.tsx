import { useEffect, useRef, useState, type FormEvent } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ExternalLink, HandCoins, LoaderCircle, LogIn, PackageSearch, Search, TriangleAlert, X } from 'lucide-react';
import { EstadoVacio } from '@/components/estado-vacio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  abrirCba,
  accionCba,
  buscarCba,
  fichaCba,
  IVA_POR_DEFECTO,
  loginCba,
  ORDENES,
  costoConIva,
  precioConIva,
  SinSesion,
  type Accion,
  type Articulo,
  type Ficha,
  type Resultado,
} from '@/lib/cba';
import { useConfig } from '@/lib/config';
import { aCentavos, totalItems, type Item } from '@/lib/fiados';
import { ARMADO_VACIO, useFiados } from '@/lib/fiados-store';
import { formatoCentavos } from '@/lib/formato';
import { enTauri } from '@/lib/storage';
import { cn } from '@/lib/utils';

const MIN_CARACTERES = 3; // el sitio no busca con menos

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Estado =
  | { tipo: 'inicio' }
  | { tipo: 'buscando' }
  | { tipo: 'sin-sesion' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'ok'; busqueda: string; resultado: Resultado; pagina: number; cargando: boolean };

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ítem de fiado con los precios del día: venta con IVA y costo con bonificación e IVA. */
const itemDe = (a: Articulo, iva: number): Item => ({
  codigo: a.codigo,
  detalle: a.detalle,
  cantidad: 1,
  precio: aCentavos(precioConIva(a.lista, iva)),
  costo: aCentavos(costoConIva(a.lista, a.bonif, iva)),
});

const abrirPagina = (codigo: string) => abrirCba(codigo).catch((e: unknown) => toast.error('No se pudo abrir la página', { description: mensaje(e) }));

export function Repuestos({ irAFiados }: { irAFiados: () => void }) {
  const { config } = useConfig();
  const { fiados, armado, setArmado, agregarAlArmado, setPedirArmado } = useFiados();
  const clienteArmado = fiados?.clientes.find((c) => c.id === armado.clienteId);

  // Sólo local: nunca toca el carrito ni los pedidos de la cuenta en Córdoba Motos.
  const fiar = (a: Articulo) => {
    agregarAlArmado(itemDe(a, iva));
    toast.success('Agregado al fiado', { description: a.detalle, duration: 2500 });
  };

  const terminarFiado = () => {
    setPedirArmado(true);
    irAFiados();
  };
  const iva = config.ivaProveedores.cba ?? IVA_POR_DEFECTO;
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicio' });
  const [ficha, setFicha] = useState<Articulo | null>(null);
  const ultima = useRef('');
  // Descarta respuestas de pedidos viejos si el usuario ya pidió otra cosa.
  const turno = useRef(0);

  const buscar = async (busqueda: string) => {
    const t = ++turno.current;
    ultima.current = busqueda;
    setEstado({ tipo: 'buscando' });
    try {
      const resultado = await buscarCba(busqueda);
      if (t === turno.current) setEstado({ tipo: 'ok', busqueda, resultado, pagina: 1, cargando: false });
    } catch (e) {
      if (t === turno.current) setEstado(e instanceof SinSesion ? { tipo: 'sin-sesion' } : { tipo: 'error', mensaje: mensaje(e) });
    }
  };

  const accion = async (a: Accion) => {
    if (estado.tipo !== 'ok' || estado.cargando) return;
    const t = ++turno.current;
    const pagina = a.tipo === 'siguiente' ? estado.pagina + 1 : a.tipo === 'anterior' ? estado.pagina - 1 : 1;
    setEstado({ ...estado, cargando: true });
    try {
      const resultado = await accionCba(a);
      if (t === turno.current) setEstado({ ...estado, resultado, pagina, cargando: false });
    } catch (e) {
      if (t !== turno.current) return;
      if (e instanceof SinSesion) return setEstado({ tipo: 'sin-sesion' });
      setEstado({ ...estado, cargando: false });
      toast.error('No se pudo cargar', { description: mensaje(e) });
    }
  };

  // Al cerrarse la ventana de login se repite la última búsqueda con la sesión nueva.
  useEffect(() => {
    if (!enTauri) return;
    const quitar = listen('cba-sesion', () => {
      if (ultima.current) void buscar(ultima.current);
    });
    return () => void quitar.then((f) => f());
  }, []);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (t.length >= MIN_CARACTERES) void buscar(t);
  };

  const abrirLogin = () => loginCba().catch((e: unknown) => setEstado({ tipo: 'error', mensaje: `No se pudo abrir el login: ${String(e)}` }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-8 pt-7 pb-5">
        <h1 className="text-[22px] font-bold tracking-tight">Precios de repuestos</h1>
        <p className="mt-0.5 text-sm text-tinta-gris">
          Córdoba Motos · costo con la bonificación de la cuenta y venta a lista, ambos con IVA {iva.toLocaleString('es-AR')} % sumado. El IVA se cambia en Configuración → Proveedores.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="max-w-6xl">
          <form onSubmit={enviar} className="mb-5 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-gris" />
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Palabras, código o código de barras. Ej.: pastilla freno wave"
                aria-label="Buscar repuesto"
                className="h-10 pl-9"
                autoFocus
              />
            </div>
            <Button type="submit" className="h-10 px-5" disabled={texto.trim().length < MIN_CARACTERES || estado.tipo === 'buscando'}>
              {estado.tipo === 'buscando' ? <LoaderCircle className="animate-spin" /> : <Search />} Buscar
            </Button>
          </form>

          {estado.tipo === 'inicio' && (
            <EstadoVacio icono={PackageSearch} titulo="Buscá un repuesto">
              Escribí al menos {MIN_CARACTERES} letras: una descripción, el código del proveedor o el código de barras.
            </EstadoVacio>
          )}

          {estado.tipo === 'buscando' && <p className="py-10 text-center text-sm text-tinta-gris">Buscando en Córdoba Motos…</p>}

          {estado.tipo === 'sin-sesion' && (
            <EstadoVacio
              icono={LogIn}
              titulo="Hay que iniciar sesión en Córdoba Motos"
              accion={
                <Button onClick={abrirLogin}>
                  <LogIn /> Iniciar sesión
                </Button>
              }
            >
              Se abre la página del proveedor en otra ventana. Al entrar, se cierra sola y se repite la búsqueda. La app no guarda la contraseña.
            </EstadoVacio>
          )}

          {estado.tipo === 'error' && (
            <EstadoVacio
              icono={TriangleAlert}
              titulo="No se pudo buscar"
              accion={
                ultima.current && (
                  <Button variant="outline" onClick={() => void buscar(ultima.current)}>
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
              <Listado estado={estado} iva={iva} onAccion={(a) => void accion(a)} onFicha={setFicha} onFiar={fiar} />
            ))}
        </div>
      </div>

      {armado.items.length > 0 && (
        <div className="flex items-center gap-4 border-t border-gris-plano bg-papel-alto px-8 py-3" role="region" aria-label="Fiado en armado">
          <HandCoins className="size-5 shrink-0 text-naranja" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Fiado{clienteArmado ? ` para ${clienteArmado.nombre}` : ''}:</span>{' '}
            {armado.items.reduce((a, i) => a + i.cantidad, 0)} {armado.items.reduce((a, i) => a + i.cantidad, 0) === 1 ? 'artículo' : 'artículos'} ·{' '}
            <span className="tabular font-semibold">{formatoCentavos(totalItems(armado.items))}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => setArmado(ARMADO_VACIO)}>
            <X /> Descartar
          </Button>
          <Button onClick={terminarFiado}>Terminar fiado</Button>
        </div>
      )}

      <FichaArticulo articulo={ficha} iva={iva} onCerrar={() => setFicha(null)} onFiar={fiar} />
    </div>
  );
}

function Listado({
  estado,
  iva,
  onAccion,
  onFicha,
  onFiar,
}: {
  estado: Extract<Estado, { tipo: 'ok' }>;
  iva: number;
  onAccion: (a: Accion) => void;
  onFicha: (a: Articulo) => void;
  onFiar: (a: Articulo) => void;
}) {
  const { resultado, pagina, cargando } = estado;
  const paginas = Math.max(1, Math.ceil(resultado.total / resultado.porPagina));

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-tinta-gris">
          {resultado.total.toLocaleString('es-AR')} {resultado.total === 1 ? 'artículo' : 'artículos'}
        </p>
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
      </div>

      <Card className={cn('py-2 transition-opacity', cargando && 'pointer-events-none opacity-50')} aria-busy={cargando}>
        <CardContent className="px-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24" />
                <TableHead>Artículo</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Lista s/IVA</TableHead>
                <TableHead className="text-right">Bonif.</TableHead>
                <TableHead className="text-right">Costo c/IVA</TableHead>
                <TableHead className="text-right">Venta c/IVA</TableHead>
                <TableHead className="w-24" />
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
                    <p className="tabular mt-0.5 text-xs text-tinta-gris">
                      {[a.codigo, a.unidad, a.empaque && `Empaque: ${a.empaque}`].filter(Boolean).join(' · ')}
                    </p>
                    {a.infoAdicional && <p className="mt-1 line-clamp-2 font-texto text-xs text-tinta-media">{a.infoAdicional}</p>}
                  </TableCell>
                  <TableCell>
                    <Stock articulo={a} />
                  </TableCell>
                  <TableCell className="tabular text-right text-tinta-media">{pesos.format(a.lista)}</TableCell>
                  <TableCell className="tabular text-right text-tinta-media">{a.bonif.toLocaleString('es-AR')} %</TableCell>
                  <TableCell className="tabular text-right text-tinta-media">{pesos.format(costoConIva(a.lista, a.bonif, iva))}</TableCell>
                  <TableCell className="tabular text-right text-base font-semibold">{pesos.format(precioConIva(a.lista, iva))}</TableCell>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        void abrirPagina(a.codigo);
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

      {paginas > 1 && (
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

function FichaArticulo({ articulo, iva, onCerrar, onFiar }: { articulo: Articulo | null; iva: number; onCerrar: () => void; onFiar: (a: Articulo) => void }) {
  const [ficha, setFicha] = useState<Ficha | 'cargando' | 'sin-sesion' | { error: string }>('cargando');

  useEffect(() => {
    if (!articulo) return;
    let vigente = true;
    setFicha('cargando');
    fichaCba(articulo.codigo)
      .then((f) => vigente && setFicha(f))
      .catch((e: unknown) => vigente && setFicha(e instanceof SinSesion ? 'sin-sesion' : { error: mensaje(e) }));
    return () => {
      vigente = false;
    };
  }, [articulo]);

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
                  <dt className="text-tinta-gris">Lista s/IVA</dt>
                  <dd className="tabular text-right">{pesos.format(articulo.lista)}</dd>
                  <dt className="text-tinta-gris">Bonificación</dt>
                  <dd className="tabular text-right">{articulo.bonif.toLocaleString('es-AR')} %</dd>
                  <dt className="text-tinta-gris">Costo c/IVA</dt>
                  <dd className="tabular text-right">{pesos.format(costoConIva(articulo.lista, articulo.bonif, iva))}</dd>
                  <dt className="font-medium">Venta c/IVA {iva.toLocaleString('es-AR')} %</dt>
                  <dd className="tabular text-right text-base font-semibold">{pesos.format(precioConIva(articulo.lista, iva))}</dd>
                </dl>

                {articulo.infoAdicional && <p className="font-texto text-sm whitespace-pre-line text-tinta-media">{articulo.infoAdicional}</p>}

                <div>
                  <p className="mb-1.5 text-sm font-semibold">Características</p>
                  {ficha === 'cargando' ? (
                    <LoaderCircle className="size-4 animate-spin text-tinta-gris" />
                  ) : ficha === 'sin-sesion' ? (
                    <p className="text-sm text-tinta-gris">Hay que iniciar sesión en Córdoba Motos.</p>
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

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => onFiar(articulo)}>
                    <HandCoins /> Fiar
                  </Button>
                  <Button variant="outline" onClick={() => void abrirPagina(articulo.codigo)}>
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
