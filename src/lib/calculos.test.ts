import { describe, expect, it } from 'vitest';
import { ajustarPrecio, calcularPresupuesto, lineaContado, lineaPlan, sumarGastos } from './calculos';

const planes = [
  { id: 'p6', cuotas: 6, recargo: 25 },
  { id: 'p3', cuotas: 3, recargo: 15 },
];

describe('calcularPresupuesto', () => {
  it('caso normal: contado con descuento y planes con recargo, gastos sin recargo ni descuento', () => {
    const r = calcularPresupuesto({
      precioLista: 2_000_000,
      descuentoContado: 10,
      incluirContado: true,
      planes,
      gastos: [150_000, 50_000],
    });
    expect(r.gastos).toBe(200_000);
    expect(r.contado).toEqual({
      id: 'contado', tipo: 'contado', cuotas: null, porcentaje: 10,
      precioMoto: 1_800_000, valorCuota: null, totalConGastos: 2_000_000,
    });
    // Ordenados por cantidad de cuotas.
    expect(r.lineas.map((l) => l.id)).toEqual(['contado', 'p3', 'p6']);
    expect(r.lineas[1]).toMatchObject({ precioMoto: 2_300_000, valorCuota: 766_667, totalConGastos: 2_500_000 });
    expect(r.lineas[2]).toMatchObject({ precioMoto: 2_500_000, valorCuota: 416_667, totalConGastos: 2_700_000 });
  });

  it('0 planes: sólo contado', () => {
    const r = calcularPresupuesto({ precioLista: 1_000_000, descuentoContado: 5, incluirContado: true, planes: [], gastos: [] });
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]?.tipo).toBe('contado');
  });

  it('sin contado marcado: contado es null', () => {
    const r = calcularPresupuesto({ precioLista: 1_000_000, descuentoContado: 5, incluirContado: false, planes, gastos: [] });
    expect(r.contado).toBeNull();
    expect(r.lineas.every((l) => l.tipo === 'plan')).toBe(true);
  });

  it('descuento 0: el precio de contado es el de lista', () => {
    const l = lineaContado(1_234_567, 0, 10_000);
    expect(l.precioMoto).toBe(1_234_567);
    expect(l.totalConGastos).toBe(1_244_567);
  });

  it('gastos vacíos: el total es el precio de la moto', () => {
    expect(sumarGastos([])).toBe(0);
    const l = lineaPlan(900_000, { id: 'x', cuotas: 12, recargo: 40 }, 0);
    expect(l.totalConGastos).toBe(l.precioMoto);
    expect(l.precioMoto).toBe(1_260_000);
    expect(l.valorCuota).toBe(105_000);
  });

  it('recargo 0 (cuotas sin interés)', () => {
    const l = lineaPlan(1_200_000, { id: 'x', cuotas: 3, recargo: 0 }, 0);
    expect(l.valorCuota).toBe(400_000);
  });
});

describe('redondeo', () => {
  it('redondea al peso sólo el resultado final de cada línea', () => {
    // 999.999 × 0,925 = 924.999,075 → 924.999; + gastos 0,4 sigue redondeando el total exacto.
    const l = lineaContado(999_999, 7.5, 0.4);
    expect(l.precioMoto).toBe(924_999);
    expect(l.totalConGastos).toBe(924_999);
    // 924.999,075 + 0,5 = 924.999,575 → 925.000 (no 924.999 + 1 redondeado aparte).
    expect(lineaContado(999_999, 7.5, 0.5).totalConGastos).toBe(925_000);
  });

  it('la cuota se calcula sobre el precio sin redondear', () => {
    // 100.001 × 1,15 = 115.001,15; / 3 = 38.333,7166 → 38.334
    const l = lineaPlan(100_001, { id: 'x', cuotas: 3, recargo: 15 }, 0);
    expect(l.precioMoto).toBe(115_001);
    expect(l.valorCuota).toBe(38_334);
  });

  it('.5 redondea hacia arriba', () => {
    expect(lineaPlan(1, { id: 'x', cuotas: 2, recargo: 0 }, 0).valorCuota).toBe(1);
    expect(lineaContado(101, 50, 0).precioMoto).toBe(51);
  });
});

describe('ajustarPrecio', () => {
  it('aplica porcentajes positivos y negativos y redondea', () => {
    expect(ajustarPrecio(1_000_000, 8)).toBe(1_080_000);
    expect(ajustarPrecio(1_000_000, -10)).toBe(900_000);
    expect(ajustarPrecio(333_333, 3.3)).toBe(344_333);
  });
});
