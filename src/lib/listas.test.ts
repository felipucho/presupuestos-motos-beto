import { describe, expect, it } from 'vitest';
import { quitarPor, upsertPor } from './listas';

const lista = [
  { id: 'a', n: 1 },
  { id: 'b', n: 2 },
];

describe('upsertPor', () => {
  it('agrega al final si el id no existe', () => {
    expect(upsertPor(lista, { id: 'c', n: 3 })).toEqual([...lista, { id: 'c', n: 3 }]);
  });

  it('reemplaza en su lugar si existe, sin tocar la lista original', () => {
    const r = upsertPor(lista, { id: 'b', n: 20 });
    expect(r).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 20 },
    ]);
    expect(lista[1]).toEqual({ id: 'b', n: 2 });
  });
});

describe('quitarPor', () => {
  it('saca el elemento con ese id y deja el resto', () => {
    expect(quitarPor(lista, 'a')).toEqual([{ id: 'b', n: 2 }]);
    expect(quitarPor(lista, 'zzz')).toEqual(lista);
  });
});
