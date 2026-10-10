import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Bike, CreditCard, Eraser, FileDown, LoaderCircle, Plus, Printer, Receipt, Settings2, UserRound, X } from 'lucide-react';
import { Campo, invalido } from '@/components/campo';
import { ColorSelector } from '@/components/color-selector';
import { InputDinero } from '@/components/inputs';
import { MotoCombobox, OTRA } from '@/components/moto-combobox';
import { VistaPrevia } from '@/components/vista-previa';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { calcularPresupuesto, lineaContado, lineaPlan } from '@/lib/calculos';
import { useConfig } from '@/lib/config';
import { etiquetaPlan, finDeMes, formatoMoneda, formatoNumero, formatoPesos, nombreArchivo, numeroPresupuesto } from '@/lib/formato';
import { nuevoId, type Config, type Moto, type Vendedor } from '@/lib/schema';
import { abrirArchivo, guardarPdf } from '@/lib/archivos';
import { enTauri } from '@/lib/entorno';
import { agregarRegistro } from '@/lib/historial';
import { altasCatalogo, mensajeAltas } from '@/lib/presupuesto';
import { generarPdf } from '@/pdf/generar';
import { imprimirPdf } from '@/pdf/imprimir';
import type { DatosPresupuesto, HojaMoto } from '@/pdf/PresupuestoPDF';
import { cn } from '@/lib/utils';

/** Una moto del presupuesto; cada una sale en su propia hoja. */
export interface ItemMoto {
  key: string;
  /** id del catálogo, OTRA, o null si no se eligió. */
  motoId: string | null;
  manual: { marca: string; modelo: string; cilindrada: string };
  guardarEnCatalogo: boolean;
  color: string;
  precioLista: number | null;
  /** Viene de la moto elegida; vacío o 0 = no se incluye. */
  patentamiento: number | null;
  /** Propias de esta moto; salen en su hoja. */
  observaciones: string;
}

export interface Borrador {
  vendedorId: string | null;
  cliente: string;
  telefono: string;
  /** Al menos una. */
  motos: ItemMoto[];
  sinContado: boolean;
  planesExcluidos: string[];
  gastosExcluidos: string[];
}

const itemVacio = (): ItemMoto => ({ key: nuevoId(), motoId: null, manual: { marca: '', modelo: '', cilindrada: '' }, guardarEnCatalogo: false, color: '', precioLista: null, patentamiento: null, observaciones: '' });

export const borradorVacio = (): Borrador => ({
  vendedorId: null,
  cliente: '',
  telefono: '',
  motos: [itemVacio()],
  sinContado: false,
  planesExcluidos: [],
  gastosExcluidos: [],
});

/** Sufijo de los id de campo: la primera moto sin número, las demás -2, -3… */
const sufijo = (i: number) => (i === 0 ? '' : `-${i + 1}`);

const motoDe = (config: Config, item: ItemMoto) => config.motos.find((m) => m.id === item.motoId);

/** Clave = id del campo con error; se cargan en el orden de la pantalla para llevar el foco al primero. */
type Errores = Record<string, string>;
type Modo = 'pdf' | 'imprimir';

function validar(b: Borrador, config: Config, vendedor: Vendedor | undefined): Errores {
  const e: Errores = {};
  if (!vendedor) e.vendedor = 'Elegí quién hace el presupuesto';
  if (!b.cliente.trim()) e.cliente = 'Ingresá el nombre del cliente';
  b.motos.forEach((item, i) => {
    const s = sufijo(i);
    if (!motoDe(config, item) && item.motoId !== OTRA) e[`moto${s}`] = 'Elegí una moto del catálogo o «Otra moto…»';
    if (item.motoId === OTRA) {
      if (!item.manual.marca.trim()) e[`manual-marca${s}`] = 'Ingresá la marca';
      if (!item.manual.modelo.trim()) e[`manual-modelo${s}`] = 'Ingresá el modelo';
    }
    if (!item.precioLista || item.precioLista <= 0) e[`precio${s}`] = 'El precio de lista tiene que ser mayor a $ 0';
  });
  return e;
}

/** Patentamiento de la moto primero, después los gastos generales que quedaron tildados. */
function gastosIncluidos(config: Config, b: Borrador, item: ItemMoto) {
  return [
    ...(item.patentamiento ? [{ nombre: 'Patentamiento', monto: item.patentamiento }] : []),
    ...config.gastos.filter((g) => !b.gastosExcluidos.includes(g.id)).map((g) => ({ nombre: g.nombre, monto: g.monto })),
  ];
}

function armarDatos(config: Config, b: Borrador, vendedor: Vendedor | undefined, ahora: Date): DatosPresupuesto {
  const planes = config.planesTarjeta.filter((p) => !b.planesExcluidos.includes(p.id));
  const hojas = b.motos.map((item): HojaMoto => {
    const gastos = gastosIncluidos(config, b, item);
    const datosMoto = motoDe(config, item) ?? item.manual;
    return {
      moto: { marca: datosMoto.marca, modelo: datosMoto.modelo, cilindrada: datosMoto.cilindrada, color: item.color, precioLista: item.precioLista },
      resumen: calcularPresupuesto({
        precioLista: item.precioLista ?? 0,
        descuentoContado: config.descuentoContado,
        incluirContado: !b.sinContado,
        planes,
        gastos: gastos.map((g) => g.monto),
      }),
      gastos,
      observaciones: item.observaciones,
    };
  });
  return {
    local: config.local,
    numero: numeroPresupuesto(config.local.prefijo, ahora),
    emision: ahora,
    validoHasta: finDeMes(ahora),
    vendedor: vendedor ? { nombre: vendedor.nombre, telefono: vendedor.telefono } : null,
    cliente: { nombre: b.cliente, telefono: b.telefono },
    hojas,
  };
}

export function NuevoPresupuesto(props: { borrador: Borrador; setBorrador: (f: (b: Borrador) => Borrador) => void; irAConfig: () => void }) {
  const { config, actualizar } = useConfig();
  const { borrador: b, setBorrador } = props;
  const [intentado, setIntentado] = useState(false);
  const [haciendo, setHaciendo] = useState<Modo | null>(null);
  const ocupado = useRef(false);

  const vendedor = config.vendedores.find((v) => v.id === b.vendedorId);
  const errores = validar(b, config, vendedor);
  const mostrar: Errores = intentado ? errores : {};
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setBorrador((x) => ({ ...x, [k]: v }));
  const setItem = (key: string, cambio: Partial<ItemMoto>) => setBorrador((x) => ({ ...x, motos: x.motos.map((it) => (it.key === key ? { ...it, ...cambio } : it)) }));

  const datos = useMemo(() => armarDatos(config, b, vendedor, new Date()), [config, b, vendedor]);

  const elegirMoto = (key: string, id: string) => {
    const m = config.motos.find((x) => x.id === id);
    setBorrador((x) => ({
      ...x,
      motos: x.motos.map((it) =>
        it.key !== key
          ? it
          : {
              ...it,
              motoId: id,
              precioLista: m ? m.precioLista : it.motoId === OTRA ? it.precioLista : null,
              patentamiento: m ? m.patentamiento || null : it.motoId === OTRA ? it.patentamiento : null,
              color: m ? (m.colores.includes(it.color) ? it.color : (m.colores[0] ?? '')) : it.motoId === OTRA ? it.color : '',
            },
      ),
    }));
  };

  /** Lo que se cambia en el presupuesto (precio, patentamiento) queda guardado en la moto del catálogo. */
  const guardarEnMoto = (item: ItemMoto, avisar: boolean) => {
    const m = motoDe(config, item);
    if (!m) return;
    const precio = item.precioLista && item.precioLista > 0 ? item.precioLista : m.precioLista;
    // Vacío = sin patentamiento sólo en este presupuesto: el catálogo conserva el suyo.
    const patentamiento = item.patentamiento ?? m.patentamiento;
    if (precio === m.precioLista && patentamiento === m.patentamiento) return;
    actualizar((c) => ({ ...c, motos: c.motos.map((x) => (x.id === m.id ? { ...x, precioLista: precio, patentamiento } : x)) }), avisar && `Guardado en ${m.marca} ${m.modelo}`);
  };

  const agregarColor = (item: ItemMoto, m: Moto, color: string) => {
    actualizar((c) => ({ ...c, motos: c.motos.map((x) => (x.id === m.id ? { ...x, colores: [...x.colores, color] } : x)) }), `Color agregado a ${m.marca} ${m.modelo}`);
    setItem(item.key, { color });
  };

  const agregarMoto = () => {
    setBorrador((x) => ({ ...x, motos: [...x.motos, itemVacio()] }));
    // El foco va al selector de la moto nueva cuando ya está en pantalla.
    requestAnimationFrame(() => document.getElementById(`moto${sufijo(b.motos.length)}`)?.focus());
  };

  const quitarMoto = (key: string) => setBorrador((x) => ({ ...x, motos: x.motos.filter((it) => it.key !== key) }));

  const limpiar = () => {
    const anterior = b;
    setBorrador(() => ({ ...borradorVacio(), vendedorId: anterior.vendedorId })); // el vendedor suele ser el mismo
    setIntentado(false);
    toast('Formulario limpio', { action: { label: 'Deshacer', onClick: () => setBorrador(() => anterior) } });
  };

  const emitir = useCallback(async (modo: Modo) => {
    if (ocupado.current) return;
    setIntentado(true);
    const primero = Object.keys(validar(b, config, vendedor))[0];
    if (primero) {
      document.getElementById(primero)?.focus();
      toast.error('Revisá los datos marcados antes de seguir');
      return;
    }
    // Con Ctrl+Enter el campo no pierde el foco, así que el cambio de precio se guarda acá.
    for (const item of b.motos) guardarEnMoto(item, false);
    if (!enTauri) {
      toast.info(modo === 'pdf' ? 'Guardar el PDF funciona sólo en la app de escritorio' : 'Imprimir funciona sólo en la app de escritorio');
      return;
    }
    ocupado.current = true;
    setHaciendo(modo);
    try {
      const final = armarDatos(config, b, vendedor, new Date());
      const bytes = await generarPdf(final);
      // Imprimir no deja archivo: el historial lo anota sin ruta.
      let ruta = '';
      if (modo === 'imprimir') await imprimirPdf(bytes, config.local.impresora);
      else {
        const guardado = await guardarPdf(bytes, nombreArchivo(final.numero, b.cliente), config.local.carpetaPdf);
        if (!guardado) return;
        ruta = guardado;
      }
      agregarRegistro({
        id: nuevoId(),
        numero: final.numero,
        fecha: final.emision.toISOString(),
        vendedor: vendedor ? { id: vendedor.id, nombre: vendedor.nombre } : null,
        cliente: { nombre: b.cliente.trim(), telefono: b.telefono.trim() },
        motos: final.hojas.map((h, i) => ({
          ...h.moto,
          precioLista: h.moto.precioLista ?? 0,
          patentamiento: b.motos[i]?.patentamiento ?? 0,
          totalContado: h.resumen.contado?.totalConGastos ?? null,
        })),
        archivo: ruta,
      }).catch((e: unknown) => toast.error('El presupuesto se hizo, pero no se pudo anotar en el historial', { description: String(e), duration: Infinity }));
      // «Otra moto…» con «Guardar en el catálogo»: se agrega, salvo que ya exista con la misma marca, modelo y cilindrada.
      const altas = b.motos
        .filter((it) => it.motoId === OTRA && it.guardarEnCatalogo)
        .map((it) => ({ key: it.key, marca: it.manual.marca, modelo: it.manual.modelo, cilindrada: it.manual.cilindrada, color: it.color, precioLista: it.precioLista, patentamiento: it.patentamiento }));
      const { nuevas, repetidas, elegida } = altasCatalogo(config.motos, altas, nuevoId);
      if (nuevas.length > 0) actualizar((c) => ({ ...c, motos: [...c.motos, ...nuevas] }), false);
      if (Object.keys(elegida).length > 0) {
        setBorrador((x) => ({ ...x, motos: x.motos.map((it) => (elegida[it.key] ? { ...it, motoId: elegida[it.key] ?? null, guardarEnCatalogo: false } : it)) }));
      }
      const extra = mensajeAltas(nuevas.length, repetidas);
      const impresora = config.local.impresora ?? 'Impresora predeterminada de Windows';
      toast.success(modo === 'pdf' ? 'PDF guardado' : 'Enviado a la impresora', {
        description: (
          <>
            <span className="block break-all">{modo === 'pdf' ? ruta : impresora}</span>
            {extra && <span className="mt-1 block">{extra}</span>}
          </>
        ),
        duration: 10000,
        action: modo === 'pdf' ? { label: 'Abrir PDF', onClick: () => void abrirArchivo(ruta).catch((e: unknown) => toast.error('No se pudo abrir el PDF', { description: String(e) })) } : undefined,
      });
    } catch (e) {
      toast.error(modo === 'pdf' ? 'No se pudo guardar el PDF' : 'No se pudo imprimir', { description: String(e), duration: Infinity });
    } finally {
      ocupado.current = false;
      setHaciendo(null);
    }
  }, [b, vendedor, config, actualizar, setBorrador]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'Enter' || e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        void emitir('pdf');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emitir]);

  // Con una sola moto se muestran los montos al lado de cada forma de pago; con varias cambian por hoja.
  const precioUnico = b.motos.length === 1 ? (b.motos[0]?.precioLista ?? null) : null;
  const contado = lineaContado(precioUnico ?? 0, config.descuentoContado, 0);
  const subtotalGastos = config.gastos.filter((g) => !b.gastosExcluidos.includes(g.id)).reduce((a, g) => a + g.monto, 0);
  const alternar = (lista: string[], id: string, incluir: boolean) => (incluir ? lista.filter((x) => x !== id) : [...lista, id]);

  const tarjetaMoto = (item: ItemMoto, i: number) => {
    const s = sufijo(i);
    const moto = motoDe(config, item);
    const varias = b.motos.length > 1;
    return (
      <Tarjeta
        key={item.key}
        icono={<Bike />}
        titulo={varias ? `Moto ${i + 1} · hoja ${i + 1}` : 'Moto'}
        extra={
          varias ? (
            <Button variant="ghost" size="sm" onClick={() => quitarMoto(item.key)} className="text-tinta-media hover:text-error">
              <X /> Quitar
            </Button>
          ) : null
        }
      >
        <div className="grid gap-4">
          <Campo id={`moto${s}`} label="Modelo" error={mostrar[`moto${s}`]}>
            <MotoCombobox id={`moto${s}`} motos={config.motos} value={item.motoId} onChange={(id) => elegirMoto(item.key, id)} invalid={Boolean(mostrar[`moto${s}`])} />
          </Campo>

          {i === 0 && config.motos.length === 0 && item.motoId !== OTRA && (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-gris-plano bg-papel px-4 py-3">
              <p className="font-texto text-sm text-tinta-media">
                Todavía no hay motos en el catálogo. Cargalas en Configuración, o usá <b className="font-sans font-semibold">Otra moto…</b> para escribirla a mano.
              </p>
              <Button variant="outline" size="sm" onClick={props.irAConfig}>
                <Settings2 /> Ir a Configuración
              </Button>
            </div>
          )}

          {item.motoId === OTRA && (
            <div className="grid animate-in gap-4 rounded-lg border border-gris-plano bg-papel/60 p-4 duration-200 fade-in-0 slide-in-from-top-1">
              <div className="grid grid-cols-3 gap-4">
                <Campo id={`manual-marca${s}`} label="Marca" error={mostrar[`manual-marca${s}`]}>
                  <Input id={`manual-marca${s}`} value={item.manual.marca} onChange={(e) => setItem(item.key, { manual: { ...item.manual, marca: e.target.value } })} {...invalido(`manual-marca${s}`, mostrar[`manual-marca${s}`])} />
                </Campo>
                <Campo id={`manual-modelo${s}`} label="Modelo" error={mostrar[`manual-modelo${s}`]}>
                  <Input id={`manual-modelo${s}`} value={item.manual.modelo} onChange={(e) => setItem(item.key, { manual: { ...item.manual, modelo: e.target.value } })} {...invalido(`manual-modelo${s}`, mostrar[`manual-modelo${s}`])} />
                </Campo>
                <Campo id={`manual-cc${s}`} label="Cilindrada" opcional>
                  <Input id={`manual-cc${s}`} value={item.manual.cilindrada} onChange={(e) => setItem(item.key, { manual: { ...item.manual, cilindrada: e.target.value } })} />
                </Campo>
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md bg-papel-alto px-3 py-2.5 ring-1 ring-gris-plano">
                <span>
                  <span className="block text-sm font-medium">Guardar en el catálogo</span>
                  <span className="block text-xs text-tinta-gris">Al generar el PDF, la moto se agrega al catálogo con este precio y patentamiento.</span>
                </span>
                <Switch checked={item.guardarEnCatalogo} onCheckedChange={(v) => setItem(item.key, { guardarEnCatalogo: v })} />
              </label>
            </div>
          )}

          <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-4">
            <Campo id={`color${s}`} label="Color" opcional>
              <ColorSelector
                key={item.motoId ?? ''}
                id={`color${s}`}
                colores={moto?.colores ?? []}
                value={item.color}
                onChange={(v) => setItem(item.key, { color: v })}
                onAgregar={moto ? (c) => agregarColor(item, moto, c) : undefined}
              />
            </Campo>
            <Campo id={`precio${s}`} label="Precio de lista" error={mostrar[`precio${s}`]}>
              <InputDinero
                id={`precio${s}`}
                value={item.precioLista}
                onValueChange={(v) => setItem(item.key, { precioLista: v })}
                onBlur={() => guardarEnMoto(item, true)}
                className="h-10 font-semibold"
                {...invalido(`precio${s}`, mostrar[`precio${s}`])}
              />
            </Campo>
            <Campo id={`patentamiento${s}`} label="Patentamiento">
              <InputDinero id={`patentamiento${s}`} value={item.patentamiento} onValueChange={(v) => setItem(item.key, { patentamiento: v })} onBlur={() => guardarEnMoto(item, true)} className="h-10" />
            </Campo>
          </div>
          <p className="-mt-2 text-xs text-tinta-gris">
            {moto
              ? 'Precio y patentamiento vienen de la moto; si los cambiás, quedan guardados en el catálogo. Patentamiento vacío = no se incluye.'
              : 'Patentamiento vacío = no se incluye.'}
          </p>
          <Campo id={`observaciones${s}`} label="Observaciones" opcional>
            <Textarea
              id={`observaciones${s}`}
              value={item.observaciones}
              onChange={(e) => setItem(item.key, { observaciones: e.target.value })}
              className="min-h-20 resize-y"
            />
          </Campo>
        </div>
      </Tarjeta>
    );
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Formulario */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-8 pt-7 pb-5">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">Nuevo presupuesto</h1>
            <p className="mt-0.5 text-sm text-tinta-gris">Completá los datos; la vista previa se actualiza sola.</p>
          </div>
          <Button variant="outline" onClick={limpiar}>
            <Eraser /> Limpiar formulario
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
          <div className="grid gap-4">
            <Tarjeta icono={<UserRound />} titulo="Vendedor y cliente">
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">Vendedor</span>
                  {config.vendedores.length === 0 ? (
                    <Pista onClick={props.irAConfig}>No hay vendedores cargados.</Pista>
                  ) : (
                    <div role="radiogroup" aria-label="Vendedor" aria-invalid={Boolean(mostrar.vendedor)} className="grid grid-cols-2 gap-2">
                      {config.vendedores.map((v, i) => (
                        <label
                          key={v.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-lg border bg-papel-alto px-3 py-2.5 transition-colors duration-150 hover:bg-gris-claro/50',
                            'has-checked:border-naranja has-checked:ring-1 has-checked:ring-naranja has-focus-visible:ring-3 has-focus-visible:ring-ring/25',
                            mostrar.vendedor ? 'border-error' : 'border-gris-plano',
                          )}
                        >
                          <input
                            type="radio"
                            name="vendedor"
                            id={i === 0 ? 'vendedor' : undefined}
                            checked={b.vendedorId === v.id}
                            onChange={() => set('vendedorId', v.id)}
                            className="size-4 accent-naranja"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{v.nombre}</span>
                            <span className="tabular block text-xs text-tinta-gris">{v.telefono}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {mostrar.vendedor && (
                    <p role="alert" className="text-xs font-medium text-error">
                      {mostrar.vendedor}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-[1.4fr_1fr] gap-4">
                  <Campo id="cliente" label="Cliente" error={mostrar.cliente}>
                    <Input id="cliente" value={b.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder="Nombre y apellido" autoFocus {...invalido('cliente', mostrar.cliente)} />
                  </Campo>
                  <Campo id="telefono" label="Teléfono del cliente" opcional>
                    <Input id="telefono" value={b.telefono} onChange={(e) => set('telefono', e.target.value)} inputMode="tel" />
                  </Campo>
                </div>
              </div>
            </Tarjeta>

            {b.motos.map(tarjetaMoto)}

            <button
              type="button"
              onClick={agregarMoto}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gris-plano px-4 py-3 text-sm font-medium text-tinta-media transition-colors duration-150 outline-none hover:border-naranja hover:bg-papel-alto hover:text-naranja focus-visible:ring-3 focus-visible:ring-ring/25"
            >
              <Plus className="size-4" /> Agregar otra moto
              <span className="font-normal text-tinta-gris">· sale en una hoja aparte, con el mismo cliente y formas de pago</span>
            </button>

            <Tarjeta icono={<CreditCard />} titulo="Formas de pago">
              <div className="grid gap-1">
                <Opcion
                  checked={!b.sinContado}
                  onChange={(v) => set('sinContado', !v)}
                  label="Contado / transferencia"
                  detalle={config.descuentoContado > 0 ? `${formatoNumero(config.descuentoContado)} % de descuento` : 'Sin descuento'}
                  monto={precioUnico ? formatoMoneda(contado.precioMoto) : null}
                />
                {[...config.planesTarjeta]
                  .sort((x, y) => x.cuotas - y.cuotas)
                  .map((p) => {
                    const l = lineaPlan(precioUnico ?? 0, p, 0);
                    return (
                      <Opcion
                        key={p.id}
                        checked={!b.planesExcluidos.includes(p.id)}
                        onChange={(v) => set('planesExcluidos', alternar(b.planesExcluidos, p.id, v))}
                        label={`Tarjeta en ${etiquetaPlan(p.cuotas)}`}
                        detalle={p.recargo > 0 ? `${formatoNumero(p.recargo)} % de recargo` : 'Sin recargo'}
                        monto={precioUnico ? `${p.cuotas} × ${formatoPesos(l.valorCuota ?? 0)}` : null}
                      />
                    );
                  })}
                {config.planesTarjeta.length === 0 && <Pista onClick={props.irAConfig}>No hay planes de tarjeta cargados.</Pista>}
              </div>
            </Tarjeta>

            <Tarjeta
              icono={<Receipt />}
              titulo="Gastos generales"
              extra={config.gastos.length > 0 ? <span className="tabular text-sm text-tinta-media">Subtotal {formatoMoneda(subtotalGastos)}</span> : null}
            >
              <div className="grid gap-1">
                {config.gastos.length === 0 && <Pista onClick={props.irAConfig}>No hay gastos generales cargados.</Pista>}
                {config.gastos.map((g) => (
                  <Opcion
                    key={g.id}
                    checked={!b.gastosExcluidos.includes(g.id)}
                    onChange={(v) => set('gastosExcluidos', alternar(b.gastosExcluidos, g.id, v))}
                    label={g.nombre}
                    monto={formatoMoneda(g.monto)}
                  />
                ))}
              </div>
            </Tarjeta>
          </div>
        </div>
      </section>

      {/* Vista previa */}
      <section className="flex w-[46%] max-w-[760px] min-w-[440px] flex-col gap-4 border-l border-gris-plano bg-papel py-6 pr-8 pl-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-tinta-media">Vista previa</h2>
          <span className="tabular text-xs text-tinta-gris">{datos.numero}</span>
        </div>
        <div className="min-h-0 flex-1">
          <VistaPrevia datos={datos} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" className="h-13 text-[15px] font-semibold" onClick={() => void emitir('pdf')} disabled={haciendo !== null}>
            {haciendo === 'pdf' ? <LoaderCircle className="animate-spin" /> : <FileDown />}
            {haciendo === 'pdf' ? 'Generando…' : 'Generar PDF'}
            <kbd className="ml-2 rounded border border-papel-alto/30 px-1.5 py-0.5 font-sans text-[11px] font-medium text-papel-alto/80">Ctrl + Enter</kbd>
          </Button>
          <Button size="lg" variant="outline" className="h-13 text-[15px] font-semibold" onClick={() => void emitir('imprimir')} disabled={haciendo !== null}>
            {haciendo === 'imprimir' ? <LoaderCircle className="animate-spin" /> : <Printer />}
            {haciendo === 'imprimir' ? 'Imprimiendo…' : 'Imprimir'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Tarjeta({ icono, titulo, extra, children }: { icono: ReactNode; titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="flex items-center justify-between px-5">
        <CardTitle className="flex items-center gap-2.5 text-[15px] [&_svg]:size-[18px] [&_svg]:text-naranja">
          {icono}
          {titulo}
        </CardTitle>
        {extra}
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

function Opcion(props: { checked: boolean; onChange: (v: boolean) => void; label: string; detalle?: string; monto: string | null }) {
  return (
    <Label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 font-normal transition-colors duration-150 hover:bg-gris-claro/60',
        !props.checked && 'text-tinta-gris',
      )}
    >
      <Checkbox checked={props.checked} onCheckedChange={(v) => props.onChange(v === true)} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{props.label}</span>
        {props.detalle && <span className="block text-xs text-tinta-gris">{props.detalle}</span>}
      </span>
      {props.monto && <span className={cn('tabular text-sm', props.checked ? 'text-tinta' : 'text-tinta-gris line-through decoration-gris-plano')}>{props.monto}</span>}
    </Label>
  );
}

function Pista({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <p className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-tinta-gris">
      {children}
      <button type="button" onClick={onClick} className="font-medium text-naranja underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none">
        Cargar en Configuración
      </button>
    </p>
  );
}
