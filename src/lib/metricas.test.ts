import { describe, expect, it } from 'vitest';
import { enTramo, metricas, mover, rango, tramos } from './metricas';
import type { Registro } from './historial';

const reg = (fecha: Date, cliente: string, vendedor: string | null, motos: [string, number][]): Registro => ({
  id: crypto.randomUUID(),
  numero: 'X',
  fecha: fecha.toISOString(),
  vendedor: vendedor ? { id: vendedor, nombre: vendedor } : null,
  cliente: { nombre: cliente, telefono: '' },
  motos: motos.map(([modelo, precioLista]) => ({ marca: 'Honda', modelo, cilindrada: '', color: '', precioLista, patentamiento: 0, totalContado: null })),
  archivo: 'x.pdf',
});

describe('rango', () => {
  const jueves = new Date(2026, 9, 8, 15, 30);
  it('semana de lunes a domingo', () => {
    const r = rango('semana', jueves)!;
    expect(r.desde).toEqual(new Date(2026, 9, 5));
    expect(r.hasta).toEqual(new Date(2026, 9, 12));
  });
  it('trimestre calendario', () => {
    expect(rango('trimestre', jueves)!.desde).toEqual(new Date(2026, 9, 1));
    expect(rango('trimestre', new Date(2026, 1, 28))!.hasta).toEqual(new Date(2026, 3, 1));
  });
  it('mover el mes desde el 31 no se saltea febrero', () => {
    expect(rango('mes', mover('mes', new Date(2026, 2, 31), -1))!.desde).toEqual(new Date(2026, 1, 1));
  });
  it('domingo cae en la semana que empezó el lunes anterior', () => {
    expect(rango('semana', new Date(2026, 9, 11))!.desde).toEqual(new Date(2026, 9, 5));
  });
  it('hasta no se incluye', () => {
    const r = rango('dia', jueves)!;
    expect(enTramo(reg(new Date(2026, 9, 9), 'a', null, [['W', 1]]), r)).toBe(false);
    expect(enTramo(reg(new Date(2026, 9, 8, 23, 59), 'a', null, [['W', 1]]), r)).toBe(true);
  });
});

describe('tramos', () => {
  const hoy = new Date(2026, 9, 8);
  it('cantidades por período', () => {
    expect(tramos('dia', hoy, null, hoy)).toHaveLength(0);
    expect(tramos('semana', hoy, null, hoy)).toHaveLength(7);
    expect(tramos('mes', hoy, null, hoy)).toHaveLength(31);
    expect(tramos('anio', hoy, null, hoy)).toHaveLength(12);
    expect(tramos('todo', hoy, new Date(2026, 5, 20), hoy).map((t) => t.etiqueta)).toEqual(['Jun 26', 'Jul 26', 'Ago 26', 'Sep 26', 'Oct 26']);
    expect(tramos('todo', hoy, new Date(2023, 0, 1), hoy).map((t) => t.etiqueta)).toEqual(['2023', '2024', '2025', '2026']);
  });
  it('las semanas del trimestre cubren todo el trimestre', () => {
    const t = tramos('trimestre', hoy, null, hoy);
    expect(t[0]!.desde <= new Date(2026, 9, 1)).toBe(true);
    expect(t.at(-1)!.hasta >= new Date(2027, 0, 1)).toBe(true);
  });
});

describe('metricas', () => {
  it('cuenta motos, clientes, montos y vendedores', () => {
    const m = metricas([
      reg(new Date(), 'Juan Pérez', 'Beto', [['Wave', 100], ['CG', 300]]),
      reg(new Date(), '  juan  perez ', 'Lorena', [['Wave', 100]]),
      reg(new Date(), 'Ana', 'Beto', [['XR', 500]]),
    ]);
    expect(m).toMatchObject({ presupuestos: 3, motos: 4, clientes: 2, clientesRepetidos: 1, monto: 1000, promedioMoto: 250 });
    expect(m.porVendedor.map((v) => [v.nombre, v.presupuestos, v.monto])).toEqual([
      ['Beto', 2, 900],
      ['Lorena', 1, 100],
    ]);
    expect(m.topMotos[0]).toEqual({ nombre: 'Honda Wave', veces: 2 });
  });
  it('vacío', () => {
    expect(metricas([])).toMatchObject({ presupuestos: 0, promedioMoto: 0, porVendedor: [], topMotos: [] });
  });
});
