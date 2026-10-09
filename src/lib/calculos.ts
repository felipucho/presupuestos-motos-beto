/** Lógica de montos del presupuesto. Funciones puras, sin dependencias de UI. */

export interface PlanCalculo {
  id: string;
  cuotas: number;
  recargo: number;
}

export interface LineaPago {
  id: string;
  tipo: 'contado' | 'plan';
  /** null en contado. */
  cuotas: number | null;
  /** Descuento (contado) o recargo (plan), en %. */
  porcentaje: number;
  precioMoto: number;
  /** null en contado. */
  valorCuota: number | null;
  totalConGastos: number;
}

export interface Resumen {
  gastos: number;
  lineas: LineaPago[];
  /** La línea de contado, si se muestra. */
  contado: LineaPago | null;
}

/** Mitad hacia arriba. toPrecision quita el error de coma flotante: 412.698,4999… es 412.698,5 y sube. */
export const redondear = (n: number) => Math.round(Number(n.toPrecision(15)));

export const sumarGastos = (montos: readonly number[]) => montos.reduce((a, m) => a + m, 0);

/** precio = P × (1 − desc/100); total = precio + G. Redondea sólo el resultado final. */
export function lineaContado(precioLista: number, descuento: number, gastos: number): LineaPago {
  const precio = precioLista * (1 - descuento / 100);
  return {
    id: 'contado',
    tipo: 'contado',
    cuotas: null,
    porcentaje: descuento,
    precioMoto: redondear(precio),
    valorCuota: null,
    totalConGastos: redondear(precio + gastos),
  };
}

/** precio = P × (1 + recargo/100); cuota = precio / cuotas; total = precio + G. */
export function lineaPlan(precioLista: number, plan: PlanCalculo, gastos: number): LineaPago {
  const precio = precioLista * (1 + plan.recargo / 100);
  return {
    id: plan.id,
    tipo: 'plan',
    cuotas: plan.cuotas,
    porcentaje: plan.recargo,
    precioMoto: redondear(precio),
    valorCuota: redondear(precio / plan.cuotas),
    totalConGastos: redondear(precio + gastos),
  };
}

export function calcularPresupuesto(args: {
  precioLista: number;
  descuentoContado: number;
  incluirContado: boolean;
  planes: readonly PlanCalculo[];
  gastos: readonly number[];
}): Resumen {
  const g = sumarGastos(args.gastos);
  const contado = args.incluirContado ? lineaContado(args.precioLista, args.descuentoContado, g) : null;
  const planes = [...args.planes].sort((a, b) => a.cuotas - b.cuotas).map((p) => lineaPlan(args.precioLista, p, g));
  return { gastos: g, contado, lineas: contado ? [contado, ...planes] : planes };
}

/** Nuevo precio de lista tras un ajuste masivo del pct %. */
export const ajustarPrecio = (precio: number, pct: number) => redondear(precio * (1 + pct / 100));
