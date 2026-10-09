/** Reemplaza el elemento con el mismo id, o lo agrega al final si no existe. */
export function upsertPor<T extends { id: string }>(lista: readonly T[], item: T): T[] {
  return lista.some((x) => x.id === item.id) ? lista.map((x) => (x.id === item.id ? item : x)) : [...lista, item];
}

/** Saca el elemento con ese id. */
export const quitarPor = <T extends { id: string }>(lista: readonly T[], id: string): T[] => lista.filter((x) => x.id !== id);
