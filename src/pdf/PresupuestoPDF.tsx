import { Document, Font, Image, Link, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import a400 from '@/assets/fuentes/Archivo_400Regular.ttf';
import a500 from '@/assets/fuentes/Archivo_500Medium.ttf';
import a600 from '@/assets/fuentes/Archivo_600SemiBold.ttf';
import a700 from '@/assets/fuentes/Archivo_700Bold.ttf';
import a800 from '@/assets/fuentes/Archivo_800ExtraBold.ttf';
import b400 from '@/assets/fuentes/Bitter_400Regular.ttf';
import b400i from '@/assets/fuentes/Bitter_400Regular_Italic.ttf';
import logoTinta from '@/assets/marca/motos-beto-tinta.png';
import type { LineaPago, Resumen } from '@/lib/calculos';
import { enlaceWhatsapp, etiquetaPlan, formatoFecha, formatoMoneda, formatoNumero } from '@/lib/formato';
import type { Local } from '@/lib/schema';

Font.register({
  family: 'Archivo',
  fonts: [
    { src: a400, fontWeight: 400 },
    { src: a500, fontWeight: 500 },
    { src: a600, fontWeight: 600 },
    { src: a700, fontWeight: 700 },
    { src: a800, fontWeight: 800 },
  ],
});
Font.register({
  family: 'Bitter',
  fonts: [
    { src: b400, fontWeight: 400 },
    { src: b400i, fontWeight: 400, fontStyle: 'italic' },
  ],
});
// Sin guiones de corte: la separación por defecto es la del inglés y parte mal las palabras en castellano.
Font.registerHyphenationCallback((palabra) => [palabra]);

// Paleta Motos Beto pensada para imprimir: hoja blanca, la tinta va en líneas y textos.
const C = {
  naranja: '#b84610',
  tinta: '#191713',
  tintaMedia: '#4a473f',
  tintaGris: '#65615a',
  grisPlano: '#c7c1b6',
  grisClaro: '#dad5cb',
  papelAlto: '#f5f3ef',
  hoja: '#ffffff',
};

export interface DatosPresupuesto {
  local: Local;
  numero: string;
  emision: Date;
  validoHasta: Date;
  vendedor: { nombre: string; telefono: string } | null;
  cliente: { nombre: string; telefono: string };
  /** Una hoja por moto; todo lo demás se repite igual en cada una. */
  hojas: HojaMoto[];
}

export interface HojaMoto {
  moto: { marca: string; modelo: string; cilindrada: string; color: string; precioLista: number | null };
  resumen: Resumen;
  gastos: { nombre: string; monto: number }[];
  observaciones: string;
}

const MARGEN = 46; // ≈ 16 mm
const NBSP = String.fromCharCode(0xa0);

const s = StyleSheet.create({
  pagina: { backgroundColor: C.hoja, paddingTop: MARGEN - 6, paddingHorizontal: MARGEN, paddingBottom: MARGEN + 44, fontFamily: 'Archivo', fontSize: 9.5, color: C.tinta, lineHeight: 1.35 },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: C.naranja },
  logo: { width: 200, height: 31.75, objectFit: 'contain' },
  datosLocal: { maxWidth: 240, textAlign: 'right', color: C.tintaMedia, fontSize: 8.5, lineHeight: 1.45 },
  rotulo: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1.1, color: C.tintaGris, textTransform: 'uppercase' },
  titulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 },
  presupuesto: { fontSize: 26, fontWeight: 800, letterSpacing: 2.5, lineHeight: 1 },
  meta: { flexDirection: 'row', gap: 18 },
  metaValor: { fontSize: 10, fontWeight: 600, marginTop: 2 },
  personas: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 24 },
  persona: { flexDirection: 'row', gap: 32 },
  clienteNombre: { fontSize: 13, fontWeight: 600, marginTop: 2 },
  qr: { flexDirection: 'row', alignItems: 'center', gap: 8, textDecoration: 'none', color: C.tintaGris },
  qrTexto: { width: 64, fontSize: 7.5, lineHeight: 1.35, textAlign: 'right' },
  moto: { marginTop: 12, borderWidth: 1, borderColor: C.grisPlano, borderLeftWidth: 3, borderLeftColor: C.naranja, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 16 },
  motoMarca: { fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: C.naranja, textTransform: 'uppercase' },
  motoModelo: { fontSize: 19, fontWeight: 700, lineHeight: 1.1, marginTop: 3 },
  motoFicha: { flexDirection: 'row', marginTop: 8, paddingTop: 7, borderTopWidth: 0.75, borderTopColor: C.grisClaro },
  fichaItem: { flex: 1 },
  fichaValor: { fontSize: 10.5, fontWeight: 500, marginTop: 2 },
  seccion: { marginTop: 14 },
  seccionTitulo: { fontSize: 11, fontWeight: 700, marginBottom: 7 },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4.5, paddingHorizontal: 10 },
  cabecera: { backgroundColor: C.tinta, color: C.papelAlto, borderTopLeftRadius: 3, borderTopRightRadius: 3, paddingVertical: 6 },
  cabeceraTexto: { fontSize: 7.5, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase' },
  colForma: { flex: 1.7, paddingRight: 8 },
  colMonto: { flex: 1, textAlign: 'right' },
  montoCelda: { fontSize: 10, fontWeight: 500 },
  totalCelda: { fontSize: 10, fontWeight: 700 },
  sub: { fontSize: 7.5, color: C.tintaGris, marginTop: 1 },
  pieTabla: { borderBottomWidth: 0.75, borderBottomColor: C.grisPlano },
  resumen: { flexDirection: 'row', gap: 16, marginTop: 12, alignItems: 'stretch' },
  gastos: { flex: 1.15 },
  gastoFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: C.grisClaro },
  gastoTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 5, fontWeight: 700 },
  totalCaja: { flex: 1, borderWidth: 1.5, borderColor: C.naranja, borderRadius: 4, padding: 10, justifyContent: 'center' },
  totalMonto: { fontSize: 20, fontWeight: 800, color: C.naranja, marginTop: 4, lineHeight: 1.1 },
  observaciones: { fontFamily: 'Bitter', fontSize: 9.5, color: C.tintaMedia, lineHeight: 1.5 },
  pie: { position: 'absolute', left: MARGEN, right: MARGEN, bottom: MARGEN - 12, borderTopWidth: 0.75, borderTopColor: C.grisPlano, paddingTop: 8, fontSize: 7.5, color: C.tintaGris, lineHeight: 1.45 },
  pieFila: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
});

const o = (v: string, alt = '—') => (v.trim() ? v.trim() : alt);

function contactos(l: Local): string[] {
  return [l.telefono && `Tel. ${l.telefono}`, l.whatsapp && `WhatsApp ${l.whatsapp}`, l.instagram && `Instagram ${l.instagram.startsWith('@') ? l.instagram : `@${l.instagram}`}`].filter(
    (x): x is string => Boolean(x && x.trim()),
  );
}

/** QR vectorial: un rectángulo por cada tramo horizontal de módulos oscuros. */
function CodigoQR({ texto, tamano }: { texto: string; tamano: number }) {
  const { modules: m } = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  let d = '';
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.get(y, x)) continue;
      let largo = 1;
      while (x + largo < m.size && m.get(y, x + largo)) largo++;
      d += `M${x} ${y}h${largo}v1h-${largo}z`;
      x += largo;
    }
  }
  const borde = 2; // margen blanco mínimo para que el lector encuentre el código
  return (
    <Svg width={tamano} height={tamano} viewBox={`${-borde} ${-borde} ${m.size + 2 * borde} ${m.size + 2 * borde}`}>
      <Path d={d} fill={C.tinta} />
    </Svg>
  );
}

function Persona({ rotulo, nombre, telefono }: { rotulo: string; nombre: string; telefono: string }) {
  return (
    <View style={s.persona}>
      <View style={{ flex: 1 }}>
        <Text style={s.rotulo}>{rotulo}</Text>
        <Text style={s.clienteNombre}>{o(nombre)}</Text>
      </View>
      {telefono.trim() !== '' ? (
        <View style={{ width: 150 }}>
          <Text style={s.rotulo}>Teléfono</Text>
          <Text style={[s.clienteNombre, { fontWeight: 500 }]}>{telefono.trim()}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FilaPago({ linea, i, descuento }: { linea: LineaPago; i: number; descuento: number }) {
  const contado = linea.tipo === 'contado';
  return (
    <View style={[s.fila, { backgroundColor: i % 2 ? C.papelAlto : C.hoja }]} wrap={false}>
      <View style={s.colForma}>
        <Text style={{ fontWeight: 600 }}>{contado ? 'Contado / transferencia' : `Tarjeta en ${etiquetaPlan(linea.cuotas ?? 1)}`}</Text>
        {contado && descuento > 0 ? <Text style={s.sub}>{formatoNumero(descuento)} % de descuento</Text> : null}
      </View>
      <Text style={[s.colMonto, s.montoCelda]}>{formatoMoneda(linea.precioMoto)}</Text>
      <Text style={[s.colMonto, s.montoCelda]}>{linea.valorCuota === null ? '—' : formatoMoneda(linea.valorCuota)}</Text>
      <Text style={[s.colMonto, s.totalCelda]}>{formatoMoneda(linea.totalConGastos)}</Text>
    </View>
  );
}

export function PresupuestoPDF({ d }: { d: DatosPresupuesto }) {
  const { local } = d;
  return (
    <Document title={`Presupuesto ${d.numero}`} author={local.nombre} creator={local.nombre} producer={local.nombre} language="es-AR">
      {d.hojas.map((h, i) => (
        <Hoja key={i} d={d} h={h} rotulo={d.hojas.length > 1 ? `Moto ${i + 1} de ${d.hojas.length}` : ''} />
      ))}
    </Document>
  );
}

function Hoja({ d, h, rotulo }: { d: DatosPresupuesto; h: HojaMoto; rotulo: string }) {
  const { local } = d;
  const { moto, resumen } = h;
  const precio = moto.precioLista;
  const contacto = contactos(local);
  const descuento = resumen.contado?.porcentaje ?? 0;
  const whatsapp = d.vendedor ? enlaceWhatsapp(d.vendedor.telefono) : null;

  return (
    <Page size="A4" style={s.pagina}>
      <View style={s.encabezado}>
        <Image src={logoTinta} style={s.logo} />
        <View style={s.datosLocal}>
          <Text style={{ fontWeight: 700, color: C.tinta, fontSize: 9.5 }}>{local.nombre}</Text>
          {local.direccion.trim() ? <Text>{local.direccion}</Text> : null}
          {contacto.map((c) => (
            <Text key={c}>{c}</Text>
          ))}
        </View>
      </View>

      <View style={s.titulo}>
        <Text style={s.presupuesto}>PRESUPUESTO</Text>
        <View style={s.meta}>
          <View>
            <Text style={s.rotulo}>Número</Text>
            <Text style={s.metaValor}>{d.numero}</Text>
          </View>
          <View>
            <Text style={s.rotulo}>Emisión</Text>
            <Text style={s.metaValor}>{formatoFecha(d.emision)}</Text>
          </View>
          <View>
            <Text style={s.rotulo}>Válido hasta</Text>
            <Text style={[s.metaValor, { color: C.naranja }]}>{formatoFecha(d.validoHasta)}</Text>
          </View>
        </View>
      </View>

      <View style={s.personas} wrap={false}>
        <View style={{ flex: 1, gap: 10 }}>
          <Persona rotulo="Vendedor" nombre={d.vendedor?.nombre ?? ''} telefono={d.vendedor?.telefono ?? ''} />
          <Persona rotulo="Cliente" nombre={d.cliente.nombre} telefono={d.cliente.telefono} />
        </View>
        {whatsapp ? (
          <Link src={whatsapp} style={s.qr}>
            <Text style={s.qrTexto}>Escaneá para escribirle por WhatsApp</Text>
            <CodigoQR texto={whatsapp} tamano={66} />
          </Link>
        ) : null}
      </View>

      <View style={s.moto} wrap={false}>
        <Text style={s.motoMarca}>{o(moto.marca, 'Marca')}</Text>
        <Text style={s.motoModelo}>{o(moto.modelo, 'Modelo')}</Text>
        <View style={s.motoFicha}>
          <View style={s.fichaItem}>
            <Text style={s.rotulo}>Cilindrada</Text>
            <Text style={s.fichaValor}>{o(moto.cilindrada)}</Text>
          </View>
          <View style={s.fichaItem}>
            <Text style={s.rotulo}>Color</Text>
            <Text style={s.fichaValor}>{o(moto.color)}</Text>
          </View>
          <View style={[s.fichaItem, { alignItems: 'flex-end' }]}>
            <Text style={s.rotulo}>Precio de lista</Text>
            <Text style={[s.fichaValor, { fontWeight: 700, fontSize: 12 }]}>{precio ? formatoMoneda(precio) : '—'}</Text>
          </View>
        </View>
      </View>

      <View style={s.seccion}>
        <Text style={s.seccionTitulo}>Formas de pago</Text>
        <View style={[s.fila, s.cabecera]}>
          <Text style={[s.colForma, s.cabeceraTexto]}>Forma de pago</Text>
          <Text style={[s.colMonto, s.cabeceraTexto]}>Precio moto</Text>
          <Text style={[s.colMonto, s.cabeceraTexto]}>Valor cuota</Text>
          <Text style={[s.colMonto, s.cabeceraTexto]}>Total con gastos</Text>
        </View>
        <View style={s.pieTabla}>
          {resumen.lineas.length === 0 ? (
            <View style={s.fila}>
              <Text style={{ color: C.tintaGris }}>No se seleccionaron formas de pago.</Text>
            </View>
          ) : (
            resumen.lineas.map((l, i) => <FilaPago key={l.id} linea={l} i={i} descuento={descuento} />)
          )}
        </View>
      </View>

      <View style={s.resumen} wrap={false}>
        <View style={s.gastos}>
          <Text style={s.seccionTitulo}>Gastos incluidos</Text>
          {h.gastos.length === 0 ? (
            <Text style={{ color: C.tintaGris }}>Sin gastos adicionales.</Text>
          ) : (
            <>
              {h.gastos.map((g, i) => (
                <View key={i} style={s.gastoFila}>
                  <Text style={{ flex: 1, paddingRight: 8 }}>{g.nombre}</Text>
                  <Text>{formatoMoneda(g.monto)}</Text>
                </View>
              ))}
              <View style={s.gastoTotal}>
                <Text>Subtotal gastos</Text>
                <Text>{formatoMoneda(resumen.gastos)}</Text>
              </View>
            </>
          )}
        </View>
        {resumen.contado && (
          <View style={s.totalCaja}>
            <Text style={s.rotulo}>Total contado / transferencia</Text>
            <Text style={s.totalMonto}>{formatoMoneda(resumen.contado.totalConGastos)}</Text>
            <Text style={[s.sub, { marginTop: 4 }]}>Moto {formatoMoneda(resumen.contado.precioMoto)} + gastos {formatoMoneda(resumen.gastos)}</Text>
          </View>
        )}
      </View>

      {h.observaciones.trim() !== '' && (
        // Sin wrap={false}: un texto largo sigue en la hoja siguiente en vez de llevarse la sección entera.
        <View style={s.seccion}>
          <Text style={s.seccionTitulo} minPresenceAhead={14}>
            Observaciones
          </Text>
          <Text style={s.observaciones}>{h.observaciones.trim()}</Text>
        </View>
      )}

      <View style={s.pie} fixed>
        <View style={s.pieFila}>
          <Text style={{ flex: 1, color: C.tintaMedia }}>{local.textoLegal.trim()}</Text>
          {rotulo !== '' ? <Text style={{ fontWeight: 600, color: C.tintaMedia }}>{rotulo}</Text> : null}
        </View>
        <View style={s.pieFila}>
          <Text style={{ flex: 1 }}>
            Presupuesto válido hasta el {formatoFecha(d.validoHasta)}, último día del mes de emisión.
          </Text>
          <Text style={{ flex: 1.3, textAlign: 'right' }}>{[local.nombre, local.direccion, ...contacto]
              .filter((x) => x.trim())
              .map((x) => (x.length < 40 ? x.replace(/ /g, NBSP) : x)) // cada dato entero en su renglón
              .join(' · ')}</Text>
        </View>
      </View>
    </Page>
  );
}
