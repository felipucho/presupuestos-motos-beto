const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** $ 1.234.567 — el espacio de Intl es no separable, así el signo no queda solo al final de una línea. */
export const formatoMoneda = (n: number) => moneda.format(n);

export const formatoNumero = (n: number) => numero.format(n);

const conCentavos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $ 7.575,31 a partir de centavos enteros. */
export const formatoCentavos = (c: number) => conCentavos.format(c / 100);

/** Sólo los dígitos de lo que se tipeó, como entero en pesos. null si está vacío. */
export function parsearPesos(texto: string): number | null {
  const d = texto.replace(/\D/g, '');
  return d ? Number(d.slice(0, 13)) : null;
}

/** Acepta coma o punto decimal. NaN si no es un número. */
export function parsearDecimal(texto: string): number {
  const t = texto.trim().replace(',', '.');
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
