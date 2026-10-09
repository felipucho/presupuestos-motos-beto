import { describe, expect, it } from 'vitest';
import { costoConIva, leerCatalogo, leerFicha, precioConIva } from './cba';

// Recorte real de las variables del catálogo (búsqueda "J7456SP").
const producto = {
  ProductoId: 'J7456SP',
  ProductoDetalle: 'PASTILLA FRENO HONDA WAVE 110S / FZ 16 NEW (REPCOR BLACK)   ',
  ProductoStock: 1706,
  ProductoImagenUri: 'https://cbamotos.com.ar/Administra/Imagenes/Productos/J7456SP.webp',
  ProductoPrecio: 2864.8,
  ProductoEstadoNombre: 'Disponible',
  UnidadMedidaDetalle: 'UN',
  ProductoDetalleEmpaque: 'CAJA X 10 UN.',
  ProductoInfoAdicional: '',
};
const datos = {
  productos: [producto, { ...producto, ProductoId: 'SINBONIF' }],
  bonificaciones: { SDT_BonificacionesBolsa: [{ vArticulo: 'J7456SP', vBon: '31.00', vEscalonamientos: [] }] },
  total: 515,
  porPagina: 20,
  orden: 4,
  semaforos: ['https://cbamotos.com.ar/Administra/design/bajostockSemaforo.png', ''],
};

describe('Córdoba Motos', () => {
  it('lee artículos, bonificación, semáforo y total del catálogo', () => {
    const r = leerCatalogo(datos);
    expect(r).toMatchObject({ total: 515, porPagina: 20, orden: 4 });
    expect(r.articulos[0]).toMatchObject({
      codigo: 'J7456SP',
      detalle: 'PASTILLA FRENO HONDA WAVE 110S / FZ 16 NEW (REPCOR BLACK)',
      lista: 2864.8,
      bonif: 31,
      stock: 'bajostock',
      unidad: 'UN',
      empaque: 'CAJA X 10 UN.',
    });
    expect(r.articulos[1]).toMatchObject({ bonif: 0, stock: '' });
  });

  it('costo a la cuenta: lista − 31 % + 21 % = 2.391,82; venta: lista + 21 % = 3.466,41', () => {
    expect(costoConIva(2864.8, 31, 21)).toBeCloseTo(2391.82, 2);
    expect(costoConIva(2864.8, 31, 0)).toBeCloseTo(1976.71, 2);
    expect(precioConIva(2864.8, 21)).toBeCloseTo(3466.41, 2);
  });

  it('suma el IVA sobre el precio de lista (2.864,80 + 21 % = 3.466,41)', () => {
    expect(precioConIva(2864.8, 21)).toBeCloseTo(3466.41, 2);
    expect(precioConIva(2864.8, 0)).toBeCloseTo(2864.8, 2);
  });

  it('avisa si la página cambió', () => {
    expect(() => leerCatalogo({})).toThrow('cambió su página');
    expect(() => leerCatalogo({ ...datos, productos: [{ ProductoId: 1 }] })).toThrow('cambió su página');
  });

  it('lee las características de la ficha', () => {
    const fila = ['', '', 'MARCA                ', '', 'GENERICO', '', 'MARCA   ', 3];
    expect(leerFicha([fila, ['', 'PARTE', 'BUJIA']]).caracteristicas).toEqual([
      ['MARCA', 'GENERICO'],
      ['PARTE', 'BUJIA'],
    ]);
    expect(leerFicha([]).caracteristicas).toEqual([]);
    expect(() => leerFicha({})).toThrow('cambió su página');
  });
});
