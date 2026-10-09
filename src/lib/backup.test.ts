import { describe, expect, it } from 'vitest';
import { leerDatosBackup } from './backup';
import { CONFIG_INICIAL } from './schema';

const cliente = {
  id: 'c1', nombre: 'Ana', telefono: '', dni: '', direccion: '', referencia: '', nota: '', limite: null, noFiar: false, archivado: false, creado: '2026-01-01T00:00:00.000Z',
};
const completo = { tipo: 'motos-beto-backup', version: 1, config: CONFIG_INICIAL, historial: [], fiados: { clientes: [cliente], movimientos: [] } };

describe('leerDatosBackup', () => {
  it('backup completo: trae configuración, historial y fiados', () => {
    const r = leerDatosBackup(completo);
    expect(r.fiados?.clientes).toHaveLength(1);
    expect(r.historial).toEqual([]);
  });

  it('backup viejo de sólo configuración: no toca historial ni fiados', () => {
    expect(leerDatosBackup(CONFIG_INICIAL)).toMatchObject({ historial: null, fiados: null });
  });

  it('un fiado dañado invalida el archivo entero', () => {
    const malo = { ...completo, fiados: { clientes: [{ ...cliente, nombre: '' }], movimientos: [] } };
    expect(() => leerDatosBackup(malo)).toThrow('fiados.clientes.0.nombre');
  });

  it('configuración dañada dentro de un completo', () => {
    expect(() => leerDatosBackup({ ...completo, config: {} })).toThrow('schemaVersion');
  });
});
