import { describe, expect, it } from 'vitest';
import {
  aCentavos,
  csvClientes,
  cuenta,
  enlaceMensaje,
  movimientoSchema,
  parecidos,
  quitarDevueltos,
  resumen,
  saldosCorridos,
  sumarItem,
  unir,
  type Cliente,
  type Item,
  type Movimiento,
} from './fiados';

let n = 0;
const base = (fecha: string) => ({ id: `m${++n}`, clienteId: 'c1', fecha, registrado: `${fecha}T12:00:${String(n % 60).padStart(2, '0')}.000Z`, nota: '', vendedor: null, anulado: null });
const item = (precio: number, cantidad = 1, costo: number | null = null): Item => ({ codigo: 'X', detalle: 'Bujía', cantidad, precio, costo });
const cargo = (fecha: string, total: number): Movimiento => ({ ...base(fecha), tipo: 'cargo', items: [item(total)] });
const pago = (fecha: string, monto: number): Movimiento => ({ ...base(fecha), tipo: 'pago', monto, medio: 'efectivo' });
const ajuste = (fecha: string, monto: number): Movimiento => ({ ...base(fecha), tipo: 'ajuste', monto });
const anular = (m: Movimiento): Movimiento => ({ ...m, anulado: { fecha: '2026-01-01T00:00:00.000Z', motivo: 'error' } });

const cliente = (id: string, nombre: string, telefono = '', dni = ''): Cliente => ({
  id, nombre, telefono, dni, direccion: '', referencia: '', nota: '', limite: null, noFiar: false, archivado: false, creado: '2026-01-01T00:00:00.000Z',
});

describe('cuenta', () => {
  it('saldo = cargos + ajustes − pagos; los anulados no cuentan', () => {
    const k = cuenta([cargo('2026-01-01', 100_00), pago('2026-01-05', 30_00), ajuste('2026-01-06', 5_00), anular(cargo('2026-01-07', 999_00))], '2026-01-10');
    expect(k.saldo).toBe(75_00);
  });

  it('el pago cancela primero lo más viejo: la antigüedad se corre al cargo siguiente', () => {
    const movs = [cargo('2026-01-01', 100_00), cargo('2026-02-01', 50_00), pago('2026-02-10', 100_00)];
    const k = cuenta(movs, '2026-03-03');
    expect(k.pendientes).toEqual([expect.objectContaining({ fecha: '2026-02-01', pendiente: 50_00 })]);
    expect(k.antiguedad).toBe(30);
  });

  it('pago parcial deja pendiente el resto del cargo más viejo', () => {
    const k = cuenta([cargo('2026-01-01', 100_00), cargo('2026-01-02', 40_00), pago('2026-01-03', 60_00)], '2026-01-03');
    expect(k.pendientes.map((p) => p.pendiente)).toEqual([40_00, 40_00]);
    expect(k.antiguedad).toBe(2);
  });

  it('pagar de más deja saldo a favor y nada pendiente', () => {
    const k = cuenta([cargo('2026-01-01', 100_00), pago('2026-01-02', 150_00)], '2026-01-02');
    expect(k.saldo).toBe(-50_00);
    expect(k.pendientes).toEqual([]);
    expect(k.antiguedad).toBeNull();
  });

  it('el saldo a favor se usa en el próximo cargo', () => {
    const k = cuenta([pago('2026-01-01', 30_00), cargo('2026-01-02', 100_00)], '2026-01-02');
    expect(k.saldo).toBe(70_00);
    expect(k.pendientes[0]?.pendiente).toBe(70_00);
  });

  it('un ajuste negativo (incobrable) deja la cuenta en 0', () => {
    const k = cuenta([cargo('2026-01-01', 100_00), ajuste('2026-06-01', -100_00)], '2026-06-01');
    expect(k).toMatchObject({ saldo: 0, antiguedad: null, pendientes: [] });
  });

  it('ganancia sólo de ítems con costo, sin anulados', () => {
    const c: Movimiento = { ...base('2026-01-01'), tipo: 'cargo', items: [item(1000, 3, 700), item(500, 2, null)] };
    const k = cuenta([c, anular({ ...c, id: 'otro' })], '2026-01-01');
    expect(k.fiado).toBe(4000);
    expect(k.ganancia).toBe(900);
  });

  it('último pago', () => {
    expect(cuenta([pago('2026-01-05', 1), pago('2026-01-02', 1), anular(pago('2026-02-01', 1))], '2026-03-01').ultimoPago).toBe('2026-01-05');
  });
});

describe('resumen', () => {
  it('suma lo que se cobra, lo a favor y lo cobrado en el mes', () => {
    const f = {
      clientes: [cliente('c1', 'Ana'), cliente('c2', 'Beto')],
      movimientos: [cargo('2026-03-01', 100_00), pago('2026-03-05', 40_00), { ...pago('2026-02-20', 80_00), clienteId: 'c2' }],
    };
    expect(resumen(f, '2026-03-10')).toMatchObject({ aCobrar: 60_00, aFavor: 80_00, deudores: 1, cobradoMes: 40_00 });
  });
});

it('saldo corrido en orden de fecha, aunque se carguen desordenados', () => {
  const a = cargo('2026-01-05', 100_00);
  const b = pago('2026-01-06', 30_00);
  const c = cargo('2026-01-01', 10_00);
  const s = saldosCorridos([a, b, c]);
  expect([s.get(c.id), s.get(a.id), s.get(b.id)]).toEqual([10_00, 110_00, 80_00]);
});

it('centavos: 7.575,31 → 757531 y redondea mitad hacia arriba', () => {
  expect(aCentavos(7575.31)).toBe(757_531);
  expect(aCentavos(0.105)).toBe(11);
  expect(aCentavos(1.005)).toBe(101);
});

it('ítems: sumar el mismo código suma cantidad; devolver saca unidades', () => {
  const lista = sumarItem(sumarItem([], item(100, 1)), item(100, 2));
  expect(lista).toEqual([item(100, 3)]);
  expect(sumarItem(lista, item(200))).toHaveLength(2);
  expect(sumarItem(lista, { ...item(100), codigo: '' })).toHaveLength(2);
  expect(sumarItem(lista, { ...item(100), detalle: 'Otro artículo' })).toHaveLength(2);
  expect(quitarDevueltos([item(100, 3), item(50, 1)], [1, 1])).toEqual([item(100, 2)]);
  expect(quitarDevueltos([item(100, 1)], [5])).toEqual([]);
});

it('parecidos: mismo nombre sin tildes, mismo celular con o sin 0/15, mismo DNI', () => {
  const lista = [cliente('a', 'José Pérez', '03533 15-412345'), cliente('b', 'Ana', '', '30.123.456')];
  expect(parecidos(lista, { id: 'x', nombre: 'jose  perez', telefono: '', dni: '' }).map((c) => c.id)).toEqual(['a']);
  expect(parecidos(lista, { id: 'x', nombre: 'Otro', telefono: '3533412345', dni: '' }).map((c) => c.id)).toEqual(['a']);
  expect(parecidos(lista, { id: 'x', nombre: 'Otro', telefono: '', dni: '30123456' }).map((c) => c.id)).toEqual(['b']);
  expect(parecidos(lista, { id: 'a', nombre: 'José Pérez', telefono: '', dni: '' })).toEqual([]);
});

it('unir pasa los movimientos y saca al cliente', () => {
  const m = cargo('2026-01-01', 1);
  const r = unir({ clientes: [cliente('c1', 'A'), cliente('c2', 'B')], movimientos: [m] }, 'c1', 'c2');
  expect(r.clientes.map((c) => c.id)).toEqual(['c2']);
  expect(r.movimientos[0]?.clienteId).toBe('c2');
});

it('WhatsApp y CSV', () => {
  expect(enlaceMensaje('3533 412345', 'Hola & chau')).toBe('https://wa.me/5493533412345?text=Hola%20%26%20chau');
  expect(enlaceMensaje('412345', 'x')).toBeNull();
  const k = cuenta([cargo('2026-01-01', 1234_56)], '2026-01-11');
  const csv = csvClientes([cliente('c1', 'Pérez; José')], new Map([['c1', k]]));
  expect(csv.startsWith('﻿Cliente;')).toBe(true);
  expect(csv).toContain('"Pérez; José";;;1234,56;10;;;');
});

it('valida movimientos: monto 0 o cargo sin ítems no pasan', () => {
  expect(movimientoSchema.safeParse(cargo('2026-01-01', 100)).success).toBe(true);
  expect(movimientoSchema.safeParse(ajuste('2026-01-01', 0)).success).toBe(false);
  expect(movimientoSchema.safeParse({ ...cargo('2026-01-01', 100), items: [] }).success).toBe(false);
  expect(movimientoSchema.safeParse({ ...pago('2026-01-01', 100), fecha: '01/01/2026' }).success).toBe(false);
});

it('unir no hace nada si es el mismo cliente o alguno no existe', () => {
  const f = { clientes: [cliente('c1', 'A'), cliente('c2', 'B')], movimientos: [] };
  expect(unir(f, 'c1', 'c1')).toBe(f);
  expect(unir(f, 'c1', 'fantasma')).toBe(f);
  expect(unir(f, 'fantasma', 'c2')).toBe(f);
});

it('csvClientes neutraliza texto que Excel tomaría como fórmula, sin tocar los montos', () => {
  const csv = csvClientes(
    [cliente('c1', '=SUMA(1;1)'), cliente('c2', '-Pérez'), cliente('c3', 'Ana', '+5493511234567')],
    new Map([['c2', { ...cuenta([], '2026-01-01'), saldo: -500 }]]),
  );
  expect(csv).toContain(`"'=SUMA(1;1)"`); // el ";" obliga a entrecomillar, y el apóstrofe va adentro
  expect(csv).toContain(`'-Pérez`);
  expect(csv).toContain('+5493511234567;'); // el teléfono sale tal cual
  expect(csv).not.toContain(`'+54`);
  expect(csv).toContain('-5,00'); // el saldo a favor sale como número, sin apóstrofe
  expect(csv).not.toContain(`'-5,00`);
});
