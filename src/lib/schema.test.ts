import { describe, expect, it } from 'vitest';
import { CONFIG_INICIAL, validarConfig } from './schema';

describe('validarConfig (carga e importación)', () => {
  it('acepta la configuración por defecto', () => {
    expect(validarConfig(CONFIG_INICIAL)).toEqual({ ok: true, config: CONFIG_INICIAL });
  });

  it('rechaza lo que no es una configuración', () => {
    expect(validarConfig(null).ok).toBe(false);
    expect(validarConfig([1, 2]).ok).toBe(false);
    expect(validarConfig({ motos: [] })).toMatchObject({ ok: false, error: expect.stringContaining('schemaVersion') });
  });

  it('lee configuraciones de antes de vendedores, patentamiento y validez a fin de mes', () => {
    const { vendedores: _, ...vieja } = CONFIG_INICIAL;
    const moto = { id: 'm', marca: 'X', modelo: 'Y', cilindrada: '', colores: [], precioLista: 10 };
    const r = validarConfig({ ...vieja, local: { ...vieja.local, validezDias: 2 }, motos: [moto] });
    expect(r).toEqual({ ok: true, config: { ...CONFIG_INICIAL, motos: [{ ...moto, patentamiento: 0 }] } });
  });

  it('rechaza un archivo de una versión más nueva', () => {
    expect(validarConfig({ ...CONFIG_INICIAL, schemaVersion: 2 })).toMatchObject({ ok: false, error: expect.stringContaining('más nueva') });
  });

  it('rechaza precios y montos inválidos, con el campo en el mensaje', () => {
    const moto = { id: 'm', marca: 'X', modelo: 'Y', cilindrada: '', colores: [], precioLista: 0 };
    expect(validarConfig({ ...CONFIG_INICIAL, motos: [moto] })).toMatchObject({ ok: false, error: expect.stringContaining('motos.0.precioLista') });
    expect(validarConfig({ ...CONFIG_INICIAL, gastos: [{ id: 'g', nombre: 'Flete', monto: -1 }] }).ok).toBe(false);
    expect(validarConfig({ ...CONFIG_INICIAL, vendedores: [{ id: 'v', nombre: 'Ana', telefono: '15 1234' }] })).toMatchObject({ ok: false, error: expect.stringContaining('vendedores.0.telefono') });
    expect(validarConfig({ ...CONFIG_INICIAL, planesTarjeta: [{ id: 'p', cuotas: 2.5, recargo: 10 }] }).ok).toBe(false);
  });
});
