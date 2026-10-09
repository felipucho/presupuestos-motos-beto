import { describe, expect, it } from 'vitest';
import { aNumero, leerJson } from './cba';
import { leerAb, leerChangomax, leerNeumat } from './proveedores';

// Recorte real de una tarjeta del listado (búsqueda "smash"), con la segunda sin stock.
const tarjeta = (id: string, titulo: string, precio: string, stock: string) => `
<div class="columContainerList col-12 col-sm-6 col-md-4 col-lg-3 col-xl-2"> <div class="row m-1 border rounded" style="background-color: white;">
<a class="col-3 col-sm-12 columImgList" href="/DetalleProducto?ArticuloID=${id}&amp;Tipo=4&amp;PresID=1"> <img class="imgListadoProducto" src="/Images/Productos/S/${id}.jpg" onerror="x"> </a>
<a align="center" class="col-4 col-sm-12 columTextList" href="/DetalleProducto?ArticuloID=${id}&amp;Tipo=4&amp;PresID=1"> <div class="row"> <div class="col textTituloProductos"> <b>${titulo} </b> </div> </div>
<div class="row"> <div class="col textTituloProductos"> <b><img src="/Images/Marcas/13.jpg"></b> </div> </div>
<div class="row"> <div class="col textTituloProductos"> <b><span class="textLeyenda">TOP KIT </span></b> </div> </div>
<div class="row"> <div class="col-9 pr-0"> <span class="textPrecio" style="color:#295ba7;"> <b>$ ${precio}</b> </span> </div> </div> </a>
<div class="col-5 col-sm-12 columBtnSemaforoList"> <span class="txtCantidadArticuloList">0</span> <span>${stock} .</span> </div> </div> </div>`;

describe('Neumat', () => {
  it('lee código, detalle, marca, precio y stock del listado', () => {
    const html = `<div class="row setColor" id="listArticulos">${tarjeta('4020100', 'KIT TRANSMISION SMASH 15T-35T', '4864.99', 'Stock')}${tarjeta('4020200', 'DISCO DE EMBRAGUE SMASH', '124379.15', 'Sin Stock')}${tarjeta('4020300', 'LLANTA', '1', 'Ultimas Unidades')}</div>`;
    const r = leerNeumat(html);
    expect(r.total).toBe(3);
    expect(r.articulos[0]).toMatchObject({
      codigo: '4020100',
      detalle: 'KIT TRANSMISION SMASH 15T-35T',
      lista: 4864.99,
      bonif: 0,
      stock: 'disponible',
      infoAdicional: 'Marca: TOP KIT',
      imagen: 'https://neumatmotos.com.ar/Images/Productos/S/4020100.jpg',
    });
    expect(r.articulos[1]).toMatchObject({ lista: 124379.15, stock: '', estado: 'Sin Stock' });
    expect(r.articulos[2]).toMatchObject({ stock: 'bajostock' });
    expect(leerNeumat(`<div id="listArticulos">${tarjeta('1', 'KIT 110 (35T &#x2B; 428H) &amp;lt;', '1', 'Stock')}</div>`).articulos[0]!.detalle).toBe('KIT 110 (35T + 428H) &lt;');
  });

  it('distingue sin resultados de una página que cambió', () => {
    expect(leerNeumat('<h2>No se encuentran productos</h2>').articulos).toEqual([]);
    expect(() => leerNeumat('<html>otra cosa</html>')).toThrow(/cambió su página/);
    // Hay tarjetas pero sin los datos de siempre: no es "sin resultados".
    expect(() => leerNeumat('<div id="listArticulos"><div class="columContainerList">nada</div></div>')).toThrow(/cambió su página/);
  });

  it('arma el carrito con los datos del botón + y lo que ya hay; sin stock no se puede sumar', () => {
    const botones = (id: string, sem: string, cant: string) =>
      `<span id="cant_${id}" class="txtCantidadArticuloList"><p class="parrafoCantidad">${cant}</p></span><img id="mas_${id}" data-Tipo="4" data-PromoID="" data-PresID="1" data-CantidadMinima="0" data-CantidadIncremento="0" data-SemaforoStock="${sem}" class="add">`;
    const html = `<div id="listArticulos">${tarjeta('4020100', 'KIT', '10', 'Stock')}${botones('4020100', '0', '2')}${tarjeta('4020200', 'DISCO', '10', 'Sin Stock')}${botones('4020200', '2', '0')}</div>`;
    const r = leerNeumat(html);
    expect(r.articulos[0]!.carrito).toEqual({ articulo: '4020100', tipo: '4', pres: '1', promo: '', minima: 0, enCarrito: 2 });
    expect(r.articulos[1]!.carrito).toBeUndefined();
  });

  it('tolera clases extra, comillas simples y precio con coma decimal', () => {
    const t = tarjeta('4020100', 'KIT SMASH', '4.864,99', 'Stock')
      .replace(/class="textPrecio"/, "class='textPrecio nuevo'")
      .replace('col textTituloProductos', 'col-12 textTituloProductos');
    expect(leerNeumat(`<div id='listArticulos'>${t}</div>`).articulos[0]).toMatchObject({ codigo: '4020100', detalle: 'KIT SMASH', lista: 4864.99 });
  });
});

const producto = {
  _id: '6ac7a20124f2f992ef612a28',
  erp: '21963',
  sku: '0015617',
  titulo: 'Paño Coral Premium 750 Gramos 40 x 35cm Amarillo',
  totalStock: 20,
  categorias: [{ id: 'linea-1' }, { id: 'rubro-1-270' }],
  variables: [{ nombre: 'marca', codigo: '229', valor: 'DAGAS' }],
  lista_de_precios: [
    { list_id: '1', precio: 6530.4 },
    { list_id: '2', precio: 7901.78 },
  ],
};

describe('ab Repuestos', () => {
  it('usa la lista de la cuenta y los descuentos en cascada de su línea', () => {
    const r = leerAb({
      lista: '1',
      descuentos: [{ grupo: 'linea-1', articulo: '0', descuento1: 30, descuento2: 5 }],
      respuesta: { total: 836, data: [producto, { ...producto, sku: 'X', totalStock: 0, categorias: [{ id: 'linea-2' }] }, { ...producto, sku: 'Y', totalStock: 3 }] },
    });
    expect(r.total).toBe(836);
    // 6530,40 × 0,70 × 0,95 = 4342,72: lo que muestra el sitio.
    expect(r.articulos[0]).toMatchObject({ codigo: '0015617', lista: 6530.4, bonif: 33.5, stock: 'disponible', infoAdicional: 'Marca: DAGAS' });
    expect(r.articulos[0]!.lista * (1 - r.articulos[0]!.bonif / 100)).toBeCloseTo(4342.72, 2);
    expect(r.articulos[1]).toMatchObject({ bonif: 0, stock: '', estado: 'Sin stock' });
    // Como el semáforo del sitio: de 1 a 9 es stock mínimo.
    expect(r.articulos[2]).toMatchObject({ stock: 'bajostock', estado: 'Stock mínimo' });
    // El carrito recibe el producto tal como vino de la búsqueda.
    expect(r.articulos[0]!.carrito).toEqual(producto);
  });

  it('el descuento del artículo gana sobre el de la línea', () => {
    const r = leerAb({
      lista: '1',
      descuentos: [
        { grupo: 'linea-1', articulo: '0', descuento1: 30, descuento2: 5 },
        { grupo: 'linea-1', articulo: '21963', descuento1: 10, descuento2: 0 },
      ],
      respuesta: { total: 1, data: [producto] },
    });
    expect(r.articulos[0]).toMatchObject({ bonif: 10, url: 'https://ventas.fundasparamotosab.com.ar/product-list/product/21963' });
  });

  it('avisa si la respuesta no tiene la forma esperada', () => {
    expect(() => leerAb({ lista: '1', respuesta: {} })).toThrow(/cambió su página/);
    // Si todos los artículos vienen sin título, el error dice qué campo falta.
    expect(() => leerAb({ lista: '1', respuesta: { data: [{ ...producto, titulo: undefined }] } })).toThrow(/«titulo»/);
  });

  it('saltea un artículo roto sin perder los demás', () => {
    const r = leerAb({ lista: '1', respuesta: { data: [{ sku: 'roto' }, producto] } });
    expect(r.articulos.map((a) => a.codigo)).toEqual(['0015617']);
    expect(r.total).toBe(1);
  });
});

// Recorte real del JSON del buscador (búsqueda "pastilla freno").
const changomax = {
  id_product: 7418,
  reference: 'FA032',
  name: ' PASTILLA DE FRENO EBC HONDA CB 750F 76/ GL1000 K/Z GOLDWING',
  price: 'ARS 7.278,20',
  price_amount: 7278.2,
  regular_price_amount: 7278.2,
  has_discount: false,
  category_name: 'REPUESTOS VINTAGE',
  url: 'https://changomax.mercomaxsa.com.ar/prestashop/REPUESTOS-VINTAGE/7418-.html',
  cover: { bySize: { home_default: { url: 'https://changomax.mercomaxsa.com.ar/prestashop/99149-home_default/ PASTILLA EBC.jpg' } } },
};

describe('Changomax', () => {
  it('lee precio sin impuestos, oferta como bonificación e imagen', () => {
    const r = leerChangomax({
      pagination: { total_items: 102 },
      products: [changomax, { ...changomax, reference: '', price_amount: 900, regular_price_amount: 1000, cover: null }],
    });
    expect(r.total).toBe(102);
    expect(r.articulos[0]).toMatchObject({
      codigo: 'FA032',
      detalle: 'PASTILLA DE FRENO EBC HONDA CB 750F 76/ GL1000 K/Z GOLDWING',
      lista: 7278.2,
      bonif: 0,
      imagen: 'https://changomax.mercomaxsa.com.ar/prestashop/99149-home_default/%20PASTILLA%20EBC.jpg',
    });
    expect(r.articulos[1]).toMatchObject({ codigo: '7418', lista: 1000, bonif: 10, imagen: '' });
    expect(r.articulos[0]!.carrito).toEqual({ producto: '7418', combinacion: '0' });
  });

  it('sin precio numérico lee el precio escrito', () => {
    const { price_amount: _, ...sinNumero } = changomax;
    expect(leerChangomax({ products: [{ ...sinNumero, regular_price_amount: undefined }] }).articulos[0]).toMatchObject({ lista: 7278.2, bonif: 0 });
  });

  it('sin resultados el sitio manda total null', () => {
    expect(leerChangomax({ pagination: { total_items: null }, products: [] })).toMatchObject({ total: 0, articulos: [] });
  });
});

describe('utilidades', () => {
  it('lee precios con cualquier separador', () => {
    expect(aNumero('$ 4864.99')).toBe(4864.99);
    expect(aNumero('ARS 7.278,20')).toBe(7278.2);
    expect(aNumero('4,864.9')).toBe(4864.9);
    expect(aNumero('1.234')).toBe(1234);
    expect(aNumero('Consultar')).toBeNaN();
  });

  it('avisa si la respuesta no es JSON', () => {
    expect(() => leerJson('MAX', '<html>login</html>')).toThrow(/MAX respondió algo que no son datos/);
  });
});
