import { pdf } from '@react-pdf/renderer';
import { PresupuestoPDF, type DatosPresupuesto } from './PresupuestoPDF';

/** Bytes del PDF. La vista previa y el archivo guardado salen de acá, del mismo componente. */
export async function generarPdf(d: DatosPresupuesto): Promise<Uint8Array> {
  const blob = await pdf(<PresupuestoPDF d={d} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
