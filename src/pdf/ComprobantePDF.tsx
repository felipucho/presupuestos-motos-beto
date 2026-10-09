import { Document, Image, Page, pdf, StyleSheet, Text, View } from '@react-pdf/renderer';
import logoTinta from '@/assets/marca/motos-beto-tinta.png';
import { formatoCentavos } from '@/lib/formato';
import { formatoDia } from '@/lib/fiados';
import type { Local } from '@/lib/schema';
// Importar la paleta también registra las fuentes Archivo y Bitter.
import { C, contactos } from './PresupuestoPDF';

export interface FilaComprobante {
  detalle: string;
  sub?: string;
  cantidad?: number;
  unitario?: number;
  /** Centavos; negativo resta. */
  importe: number;
  tachado?: boolean;
}

export interface DatosComprobante {
  local: Local;
  titulo: string;
  /** AAAA-MM-DD */
  fecha: string;
  cliente: { nombre: string; telefono: string; dni: string };
  filas: FilaComprobante[];
  conCantidades: boolean;
  totales: { rotulo: string; valor: number; destacado?: boolean }[];
  nota: string;
  firma: boolean;
}

const MARGEN = 46;

const s = StyleSheet.create({
  pagina: { backgroundColor: C.hoja, paddingTop: MARGEN - 6, paddingHorizontal: MARGEN, paddingBottom: MARGEN + 30, fontFamily: 'Archivo', fontSize: 9.5, color: C.tinta, lineHeight: 1.35 },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: C.naranja },
  logo: { width: 200, height: 31.75, objectFit: 'contain' },
  datosLocal: { maxWidth: 240, textAlign: 'right', color: C.tintaMedia, fontSize: 8.5, lineHeight: 1.45 },
  rotulo: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1.1, color: C.tintaGris, textTransform: 'uppercase' },
  titulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 },
  tituloTexto: { fontSize: 22, fontWeight: 800, letterSpacing: 2, lineHeight: 1 },
  valor: { fontSize: 12, fontWeight: 600, marginTop: 2 },
  cliente: { marginTop: 14, flexDirection: 'row', gap: 28 },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4.5, paddingHorizontal: 10 },
  cabecera: { backgroundColor: C.tinta, color: C.papelAlto, borderTopLeftRadius: 3, borderTopRightRadius: 3, paddingVertical: 6, marginTop: 16 },
  cabeceraTexto: { fontSize: 7.5, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase' },
  colDetalle: { flex: 3, paddingRight: 8 },
  colNum: { flex: 1, textAlign: 'right' },
  sub: { fontSize: 7.5, color: C.tintaGris, marginTop: 1 },
  totales: { marginTop: 10, alignSelf: 'flex-end', width: 240 },
  total: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  nota: { marginTop: 16, fontFamily: 'Bitter', fontSize: 9.5, color: C.tintaMedia, lineHeight: 1.5 },
  firma: { marginTop: 56, flexDirection: 'row', justifyContent: 'space-between', gap: 40 },
  firmaLinea: { flex: 1, borderTopWidth: 0.75, borderTopColor: C.tinta, paddingTop: 4, fontSize: 8, color: C.tintaMedia, textAlign: 'center' },
  pie: { position: 'absolute', left: MARGEN, right: MARGEN, bottom: MARGEN - 12, borderTopWidth: 0.75, borderTopColor: C.grisPlano, paddingTop: 8, fontSize: 7.5, color: C.tintaGris },
});

export function ComprobantePDF({ d }: { d: DatosComprobante }) {
  const { local } = d;
  return (
    <Document title={`${d.titulo} ${d.cliente.nombre}`} author={local.nombre} creator={local.nombre} producer={local.nombre} language="es-AR">
      <Page size="A4" style={s.pagina}>
        <View style={s.encabezado}>
          <Image src={logoTinta} style={s.logo} />
          <View style={s.datosLocal}>
            <Text style={{ fontWeight: 700, color: C.tinta, fontSize: 9.5 }}>{local.nombre}</Text>
            {local.direccion.trim() ? <Text>{local.direccion}</Text> : null}
            {contactos(local).map((c) => (
              <Text key={c}>{c}</Text>
            ))}
          </View>
        </View>

        <View style={s.titulo}>
          <Text style={s.tituloTexto}>{d.titulo.toUpperCase()}</Text>
          <View>
            <Text style={s.rotulo}>Fecha</Text>
            <Text style={s.valor}>{formatoDia(d.fecha)}</Text>
          </View>
        </View>

        <View style={s.cliente} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={s.rotulo}>Cliente</Text>
            <Text style={[s.valor, { fontSize: 13 }]}>{d.cliente.nombre}</Text>
          </View>
          {d.cliente.dni.trim() ? (
            <View>
              <Text style={s.rotulo}>DNI</Text>
              <Text style={s.valor}>{d.cliente.dni}</Text>
            </View>
          ) : null}
          {d.cliente.telefono.trim() ? (
            <View>
              <Text style={s.rotulo}>Teléfono</Text>
              <Text style={s.valor}>{d.cliente.telefono}</Text>
            </View>
          ) : null}
        </View>

        {d.filas.length > 0 && (
          <>
            <View style={[s.fila, s.cabecera]}>
              <Text style={[s.colDetalle, s.cabeceraTexto]}>Detalle</Text>
              {d.conCantidades && <Text style={[s.colNum, s.cabeceraTexto, { flex: 0.6 }]}>Cant.</Text>}
              {d.conCantidades && <Text style={[s.colNum, s.cabeceraTexto]}>Unitario</Text>}
              <Text style={[s.colNum, s.cabeceraTexto]}>Importe</Text>
            </View>
            <View style={{ borderBottomWidth: 0.75, borderBottomColor: C.grisPlano }}>
              {d.filas.map((f, i) => (
                <View key={i} style={[s.fila, { backgroundColor: i % 2 ? C.papelAlto : C.hoja }]} wrap={false}>
                  <View style={s.colDetalle}>
                    <Text style={f.tachado ? { textDecoration: 'line-through', color: C.tintaGris } : { fontWeight: 500 }}>{f.detalle}</Text>
                    {f.sub ? <Text style={s.sub}>{f.sub}</Text> : null}
                  </View>
                  {d.conCantidades && <Text style={[s.colNum, { flex: 0.6 }]}>{f.cantidad ?? ''}</Text>}
                  {d.conCantidades && <Text style={s.colNum}>{f.unitario === undefined ? '' : formatoCentavos(f.unitario)}</Text>}
                  <Text style={[s.colNum, { fontWeight: 600 }, f.tachado ? { textDecoration: 'line-through', color: C.tintaGris } : {}]}>{formatoCentavos(f.importe)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={s.totales} wrap={false}>
          {d.totales.map((t) => (
            <View key={t.rotulo} style={[s.total, t.destacado ? { borderTopWidth: 1.5, borderTopColor: C.naranja, marginTop: 4, paddingTop: 6 } : {}]}>
              <Text style={t.destacado ? { fontWeight: 700 } : { color: C.tintaMedia }}>{t.rotulo}</Text>
              <Text style={t.destacado ? { fontWeight: 800, fontSize: 14, color: C.naranja } : { fontWeight: 600 }}>{formatoCentavos(t.valor)}</Text>
            </View>
          ))}
        </View>

        {d.nota.trim() !== '' && <Text style={s.nota}>{d.nota.trim()}</Text>}

        {d.firma && (
          <View style={s.firma} wrap={false}>
            <Text style={s.firmaLinea}>Firma del cliente</Text>
            <Text style={s.firmaLinea}>Aclaración y DNI</Text>
          </View>
        )}

        <View style={s.pie} fixed>
          <Text>{[local.nombre, local.direccion].filter((x) => x.trim()).join(' · ')}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generarComprobante(d: DatosComprobante): Promise<Uint8Array> {
  const blob = await pdf(<ComprobantePDF d={d} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
