import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import {
  descripcionItems,
  enlaceMensaje,
  formatoDia,
  importe,
  MEDIOS,
  mensajeDeuda,
  saldosCorridos,
  saldosRecibo,
  totalItems,
  type Cargo,
  type Cliente,
  type Cuenta,
  type Medio,
  type Movimiento,
} from '@/lib/fiados';
import { formatoCentavos, nombreSeguro } from '@/lib/formato';
import type { Local } from '@/lib/schema';
import { abrirArchivo, abrirWhatsapp, guardarPdf } from '@/lib/archivos';
import { enTauri } from '@/lib/entorno';
import { cn } from '@/lib/utils';
import { generarComprobante, type DatosComprobante } from '@/pdf/ComprobantePDF';

export const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const etiquetaMedio = (m: Medio) => MEDIOS.find(([id]) => id === m)?.[1] ?? m;

/** Qué fue el movimiento, en una línea. */
export const detalleMovimiento = (m: Movimiento) =>
  m.tipo === 'cargo' ? descripcionItems(m.items) : m.tipo === 'pago' ? `Pago · ${etiquetaMedio(m.medio)}` : m.nota || (m.monto < 0 ? 'Descuento' : 'Ajuste');

const LEYENDA = 'Comprobante interno, no válido como factura.';

export function Antiguedad({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-tinta-gris">—</span>;
  const clase = dias <= 30 ? 'bg-exito-suave text-exito' : dias <= 60 ? 'bg-naranja/15 text-naranja-hondo' : 'bg-error-suave text-error';
  return (
    <span className={cn('tabular rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', clase)} title="Desde el fiado impago más viejo">
      {dias === 0 ? 'Hoy' : dias === 1 ? '1 día' : `${dias} días`}
    </span>
  );
}

/** Saldo con su sentido: debe, a favor o al día. */
export function Saldo({ saldo, className }: { saldo: number; className?: string }) {
  if (saldo === 0) return <span className={cn('text-tinta-gris', className)}>Al día</span>;
  if (saldo < 0) return <span className={cn('tabular text-exito', className)}>{formatoCentavos(-saldo)} a favor</span>;
  return <span className={cn('tabular', className)}>{formatoCentavos(saldo)}</span>;
}

export function Dato({ titulo, valor, detalle, tono }: { titulo: string; valor: ReactNode; detalle?: ReactNode; tono?: 'mal' | 'bien' }) {
  return (
    <Card className="gap-1 px-4 py-4">
      <p className="text-xs font-medium text-tinta-gris">{titulo}</p>
      <p className={cn('tabular truncate text-[22px] font-bold tracking-tight', tono === 'mal' && 'text-error', tono === 'bien' && 'text-exito')}>{valor}</p>
      {detalle && <p className="text-xs text-tinta-gris">{detalle}</p>}
    </Card>
  );
}

export function avisarWhatsapp(local: string, c: Cliente, k: Cuenta) {
  const url = enlaceMensaje(c.telefono, mensajeDeuda(local, c, k));
  if (!url) return void toast.error('El teléfono no sirve para WhatsApp', { description: 'Cargá el celular con código de área, sin 0 ni 15.' });
  if (!enTauri) return void window.open(url, '_blank', 'noopener');
  abrirWhatsapp(url).catch((e: unknown) => toast.error('No se pudo abrir WhatsApp', { description: mensaje(e) }));
}

export async function guardarComprobante([d, nombre]: [DatosComprobante, string], carpeta: string | null) {
  if (!enTauri) return void toast.info('Disponible sólo en la app de escritorio');
  try {
    const ruta = await guardarPdf(await generarComprobante(d), `${nombre}.pdf`, carpeta, 'Guardar comprobante');
    if (!ruta) return;
    toast.success('PDF guardado', {
      description: ruta,
      action: { label: 'Abrir PDF', onClick: () => void abrirArchivo(ruta).catch((e: unknown) => toast.error('No se pudo abrir el PDF', { description: mensaje(e) })) },
    });
  } catch (e) {
    toast.error('No se pudo guardar el PDF', { description: mensaje(e) });
  }
}

const datosCliente = (c: Cliente) => ({ nombre: c.nombre, telefono: c.telefono, dni: c.dni });
/** Para encontrar en la app el movimiento de un papel impreso. */
export const numero = (m: Movimiento) => m.id.slice(0, 8).toUpperCase();

export function vale(local: Local, c: Cliente, m: Cargo): [DatosComprobante, string] {
  return [
    {
      local,
      titulo: 'Vale de fiado',
      numero: numero(m),
      fecha: m.fecha,
      cliente: datosCliente(c),
      conCantidades: true,
      filas: m.items.map((i) => ({ detalle: i.detalle, sub: i.codigo || undefined, cantidad: i.cantidad, unitario: i.precio, importe: i.precio * i.cantidad })),
      totales: [{ rotulo: 'Total fiado', valor: totalItems(m.items), destacado: true }],
      nota: [m.nota, `Precios fijos en pesos al día del fiado. ${LEYENDA}`].filter(Boolean).join('\n'),
      firma: true,
    },
    `Vale-fiado-${m.fecha}-${nombreSeguro(c.nombre)}`,
  ];
}

/** `todos`: los movimientos del cliente, incluido el pago. `hoy`: el saldo que se muestra es el de ese día. */
export function recibo(local: Local, c: Cliente, m: Extract<Movimiento, { tipo: 'pago' }>, todos: readonly Movimiento[], hoy: string): [DatosComprobante, string] {
  const { anterior, saldo } = saldosRecibo(todos, m);
  return [
    {
      local,
      titulo: 'Recibo de pago',
      numero: numero(m),
      fecha: m.fecha,
      cliente: datosCliente(c),
      conCantidades: false,
      filas: [{ detalle: `Pago en ${etiquetaMedio(m.medio).toLowerCase()}`, sub: m.nota || undefined, importe: m.monto }],
      totales: [
        ...(anterior === null ? [] : [{ rotulo: 'Saldo anterior', valor: anterior }]),
        { rotulo: 'Pagó', valor: m.monto },
        { rotulo: `${saldo < 0 ? 'Saldo a favor' : 'Saldo pendiente'} al ${formatoDia(hoy)}`, valor: Math.abs(saldo), destacado: true },
      ],
      nota: `Recibimos de ${c.nombre} la suma de ${formatoCentavos(m.monto)} a cuenta de su saldo. ${LEYENDA}`,
      firma: false,
    },
    `Recibo-${m.fecha}-${nombreSeguro(c.nombre)}`,
  ];
}

export function estadoDeCuenta(local: Local, c: Cliente, movs: readonly Movimiento[], k: Cuenta, hoy: string): [DatosComprobante, string] {
  const saldos = saldosCorridos(movs);
  const activos = movs.filter((m) => !m.anulado).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.registrado.localeCompare(b.registrado));
  return [
    {
      local,
      titulo: 'Estado de cuenta',
      fecha: hoy,
      cliente: datosCliente(c),
      conCantidades: false,
      filas: activos.map((m) => ({
        detalle: `${formatoDia(m.fecha)} · ${detalleMovimiento(m)}`,
        sub: `Saldo: ${formatoCentavos(saldos.get(m.id) ?? 0)}`,
        importe: importe(m),
      })),
      totales: [
        { rotulo: k.saldo < 0 ? 'Saldo a favor' : 'Saldo', valor: Math.abs(k.saldo), destacado: true },
      ],
      nota: `Los pagos aparecen en negativo. ${LEYENDA}`,
      firma: false,
    },
    `Estado-de-cuenta-${hoy}-${nombreSeguro(c.nombre)}`,
  ];
}
