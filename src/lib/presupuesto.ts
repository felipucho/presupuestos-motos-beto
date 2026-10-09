import type { Moto } from './schema';

/** Una moto de «Otra moto…» que se pidió guardar en el catálogo. */
export interface AltaManual {
  key: string;
  marca: string;
  modelo: string;
  cilindrada: string;
  color: string;
  precioLista: number | null;
  patentamiento: number | null;
}

export interface Altas {
  /** Motos nuevas para agregar al catálogo. */
  nuevas: Moto[];
  /** Cuántas ya estaban en el catálogo. */
  repetidas: number;
  /** Para cada key de alta, el id de la moto del catálogo que la representa. */
  elegida: Record<string, string>;
}

const clave = (m: Pick<Moto, 'marca' | 'modelo' | 'cilindrada'>) => `${m.marca}|${m.modelo}|${m.cilindrada}`.toLocaleLowerCase('es');

/**
 * Arma las altas de «Otra moto…». Una que ya existe (misma marca, modelo y cilindrada) no se duplica:
 * se elige la existente. `nuevoId` se inyecta para que el resultado sea predecible en los tests.
 */
export function altasCatalogo(existentes: readonly Moto[], altas: readonly AltaManual[], nuevoId: () => string): Altas {
  const nuevas: Moto[] = [];
  const elegida: Record<string, string> = {};
  let repetidas = 0;
  for (const it of altas) {
    const nueva: Moto = {
      id: nuevoId(),
      marca: it.marca.trim(),
      modelo: it.modelo.trim(),
      cilindrada: it.cilindrada.trim(),
      colores: it.color.trim() ? [it.color.trim()] : [],
      precioLista: it.precioLista ?? 0,
      patentamiento: it.patentamiento ?? 0,
    };
    const repetida = [...existentes, ...nuevas].find((m) => clave(m) === clave(nueva));
    if (repetida && !nuevas.includes(repetida)) repetidas++;
    if (!repetida) nuevas.push(nueva);
    elegida[it.key] = (repetida ?? nueva).id;
  }
  return { nuevas, repetidas, elegida };
}

/** Frase para el toast con lo que pasó con las altas. Vacía si no hubo nada. */
export function mensajeAltas(nuevas: number, repetidas: number): string {
  return [
    nuevas === 1 ? 'La moto se agregó al catálogo.' : nuevas > 1 ? `Se agregaron ${nuevas} motos al catálogo.` : '',
    repetidas > 0 ? (repetidas === 1 ? 'Una moto ya estaba en el catálogo.' : `${repetidas} motos ya estaban en el catálogo.`) : '',
  ]
    .filter(Boolean)
    .join(' ');
}
