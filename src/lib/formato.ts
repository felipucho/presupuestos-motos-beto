const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
// Hasta 4 decimales: un 7,125 % se muestra como es, no como el 7,13 % que no se aplica.
const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 });

/** $ 1.234.567 — el espacio de Intl es no separable, así el signo no queda solo al final de una línea. */
export const formatoMoneda = (n: number) => moneda.format(n);

export const formatoNumero = (n: number) => numero.format(n);

const conCentavos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $ 7.575,31 a partir de centavos enteros. */
export const formatoCentavos = (c: number) => conCentavos.format(c / 100);

/** Pesos sin decimales si es entero; si no, con centavos: $ 333.333,33. */
export const formatoPesos = (n: number) => (Number.isInteger(n) ? moneda.format(n) : conCentavos.format(n));

/**
 * Pesos enteros a partir de lo tipeado o pegado: los puntos son de miles y unos centavos al final («1.234,56»)
 * se redondean al peso. null si está vacío o no entra en un número seguro.
 */
export function parsearPesos(texto: string): number | null {
  const centavos = /,(\d{1,2})\s*$/.exec(texto);
  const d = (centavos ? texto.slice(0, centavos.index) : texto).replace(/\D/g, '');
  if (!d) return null;
  const n = Number(d) + (centavos && Number(centavos[1]!.padEnd(2, '0')) >= 50 ? 1 : 0);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Número decimal en formato argentino. Un punto seguido de grupos de 3 dígitos es separador de miles
 * («1.500» y «1.500,5» valen 1500 y 1500,5); la coma es el decimal. NaN si no es un número.
 */
export function parsearDecimal(texto: string): number {
  let t = texto.trim();
  // El primer grupo no empieza con 0: «0.750» es 0,75, no 750.
  if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d*)?$/.test(t)) t = t.replace(/\./g, '');
  t = t.replace(',', '.');
  return t === '' || !/^-?\d*\.?\d*$/.test(t) ? NaN : Number(t);
}

const dos = (n: number) => String(n).padStart(2, '0');

export const formatoFecha = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Último día del mes de la fecha dada. */
export const finDeMes = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/**
 * https://wa.me/549… para un celular argentino. Acepta espacios, guiones, +54 y el 0 inicial;
 * null si no quedan 10 dígitos (código de área + número, sin el 15).
 */
export function enlaceWhatsapp(telefono: string): string | null {
  let d = telefono.replace(/\D/g, '');
  if (d.startsWith('549') && d.length === 13) d = d.slice(3);
  else if (d.startsWith('54') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? `https://wa.me/549${d}` : null;
}

/** Minúsculas, sin tildes ni espacios sobrantes: para comparar y buscar texto tipeado a mano. */
export const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();

/** AAAAMMDD en hora local. */
export const fechaCompacta = (d: Date) => `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}`;

/** {PREFIJO}-AAAAMMDD-HHMMSS con la hora local. */
export function numeroPresupuesto(prefijo: string, d: Date): string {
  const fecha = fechaCompacta(d);
  const hora = `${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`;
  return `${prefijo.toUpperCase()}-${fecha}-${hora}`;
}

/** Presupuesto-{numero}-{cliente}.pdf, sin caracteres que Windows no acepta en un nombre de archivo. */
export function nombreArchivo(numero: string, cliente: string): string {
  const limpio = nombreSeguro(cliente);
  return `Presupuesto-${numero}${limpio ? `-${limpio}` : ''}.pdf`;
}

/** Texto sin los caracteres que Windows no acepta en un nombre de archivo. */
export const nombreSeguro = (t: string) =>
  t
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 60);

export const etiquetaPlan = (cuotas: number) => (cuotas === 1 ? '1 pago' : `${cuotas} cuotas`);
