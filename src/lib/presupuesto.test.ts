import { describe, expect, it } from 'vitest';
import { altasCatalogo, mensajeAltas, type AltaManual } from './presupuesto';
import type { Moto } from './schema';

const moto = (id: string, marca: string, modelo: string, cilindrada: string): Moto => ({ id, marca, modelo, cilindrada, colores: [], precioLista: 1000, patentamiento: 0 });
const alta = (key: string, marca: string, modelo: string, cilindrada = '150'): AltaManual => ({ key, marca, modelo, cilindrada, color: 'Rojo', precioLista: 900, patentamiento: 50 });
const idsPredecibles = () => {
  let n = 0;
  return () => `nuevo-${++n}`;
};

describe('altasCatalogo', () => {
  it('agrega una moto que no está en el catálogo', () => {
    const r = altasCatalogo([], [alta('k1', 'Corven', 'Triax')], idsPredecibles());
    expect(r.nuevas).toEqual([{ id: 'nuevo-1', marca: 'Corven', modelo: 'Triax', cilindrada: '150', colores: ['Rojo'], precioLista: 900, patentamiento: 50 }]);
    expect(r.repetidas).toBe(0);
    expect(r.elegida).toEqual({ k1: 'nuevo-1' });
  });

  it('no duplica la que ya existe (sin mayúsculas ni espacios de por medio) y la elige', () => {
    const r = altasCatalogo([moto('m1', 'Corven', 'Triax', '150')], [alta('k1', '  corven ', 'TRIAX')], idsPredecibles());
    expect(r.nuevas).toEqual([]);
    expect(r.repetidas).toBe(1);
    expect(r.elegida).toEqual({ k1: 'm1' });
  });

  it('dos altas iguales en el mismo presupuesto generan una sola moto', () => {
    const r = altasCatalogo([], [alta('k1', 'Motomel', 'CG'), alta('k2', 'Motomel', 'CG')], idsPredecibles());
    expect(r.nuevas).toHaveLength(1);
    expect(r.elegida).toEqual({ k1: 'nuevo-1', k2: 'nuevo-1' });
  });

  it('la misma marca y modelo con otra cilindrada es otra moto', () => {
    const r = altasCatalogo([moto('m1', 'Motomel', 'CG', '125')], [alta('k1', 'Motomel', 'CG', '150')], idsPredecibles());
    expect(r.nuevas).toHaveLength(1);
    expect(r.repetidas).toBe(0);
  });
});

describe('mensajeAltas', () => {
  it('describe lo que pasó, o nada si no hubo altas', () => {
    expect(mensajeAltas(0, 0)).toBe('');
    expect(mensajeAltas(1, 0)).toBe('La moto se agregó al catálogo.');
    expect(mensajeAltas(2, 1)).toBe('Se agregaron 2 motos al catálogo. Una moto ya estaba en el catálogo.');
    expect(mensajeAltas(0, 3)).toBe('3 motos ya estaban en el catálogo.');
  });
});
