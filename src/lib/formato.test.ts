import { describe, expect, it } from 'vitest';
import { formatoMoneda, nombreArchivo, numeroPresupuesto, parsearDecimal, parsearPesos, finDeMes, formatoFecha, enlaceWhatsapp } from './formato';

describe('formato', () => {
  it('moneda es-AR sin decimales', () => {
    expect(formatoMoneda(1234567).replace(/\s/g, ' ')).toBe('$ 1.234.567');
    expect(formatoMoneda(0.6).replace(/\s/g, ' ')).toBe('$ 1');
  });

  it('número de presupuesto con hora local', () => {
    expect(numeroPresupuesto('mb', new Date(2026, 9, 8, 20, 34, 12))).toBe('MB-20261008-203412');
  });

  it('validez hasta el último día del mes', () => {
    expect(formatoFecha(finDeMes(new Date(2026, 9, 8)))).toBe('31/10/2026');
    expect(formatoFecha(finDeMes(new Date(2028, 1, 29)))).toBe('29/02/2028');
    expect(formatoFecha(finDeMes(new Date(2026, 11, 31)))).toBe('31/12/2026');
  });

  it('enlace de WhatsApp para celulares argentinos', () => {
    const ok = 'https://wa.me/5493533123456';
    for (const t of ['3533 12-3456', '03533 123456', '+54 9 3533 123456', '54 3533 123456', '5493533123456']) expect(enlaceWhatsapp(t)).toBe(ok);
    expect(enlaceWhatsapp('03533 15 123456')).toBeNull(); // con el 15 no se sabe dónde termina el código de área
    expect(enlaceWhatsapp('123456')).toBeNull();
    expect(enlaceWhatsapp('')).toBeNull();
  });

  it('nombre de archivo sin caracteres inválidos', () => {
    expect(nombreArchivo('MB-1', 'Juan "Pepe" <Pérez>?')).toBe('Presupuesto-MB-1-Juan Pepe Pérez.pdf');
    expect(nombreArchivo('MB-1', '  ')).toBe('Presupuesto-MB-1.pdf');
  });

  it('parsea pesos y decimales', () => {
    expect(parsearPesos('$ 1.234.567')).toBe(1234567);
    expect(parsearPesos('')).toBeNull();
    expect(parsearDecimal('12,5')).toBe(12.5);
    expect(parsearDecimal('-3')).toBe(-3);
    expect(parsearDecimal('abc')).toBeNaN();
    // Punto de miles: antes «1.500» se leía como 1,5 y cobraba un monto 1000 veces menor.
    expect(parsearDecimal('1.500')).toBe(1500);
    expect(parsearDecimal('1.500.000')).toBe(1500000);
    expect(parsearDecimal('1.500,5')).toBe(1500.5);
    expect(parsearDecimal('1.5')).toBe(1.5);
    expect(parsearDecimal('1,5')).toBe(1.5);
    expect(parsearPesos('12345678901234567890')).toBeNull();
  });

  it('pesos pegados con centavos se redondean al peso, no se multiplican por 100', () => {
    expect(parsearPesos('1.234,56')).toBe(1235);
    expect(parsearPesos('$ 1.234.567,89')).toBe(1234568);
    expect(parsearPesos('1.234,4')).toBe(1234);
    expect(parsearPesos('1.234,5')).toBe(1235);
  });

  it('un grupo de miles no empieza con 0', () => {
    expect(parsearDecimal('0.750')).toBe(0.75);
    expect(parsearDecimal('0.5')).toBe(0.5);
  });
});
