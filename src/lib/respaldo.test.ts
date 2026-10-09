import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fiados } from './fiados';
import { contenidoRespaldo, leerEstadoRespaldo, subirFiados } from './respaldo';

const { invocar, almacen } = vi.hoisted(() => ({
  invocar: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  almacen: new Map<string, unknown>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invocar }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));
vi.mock('./entorno', () => ({ enTauri: true }));
vi.mock('./almacen', () => ({
  leerClave: async (_archivo: string, clave: string) => almacen.get(clave) ?? null,
  guardarClave: async (_archivo: string, clave: string, valor: unknown) => void almacen.set(clave, valor),
}));

const cliente = (nombre: string) => ({ id: nombre, nombre, telefono: '', dni: '', direccion: '', referencia: '', nota: '', limite: null, noFiar: false, archivado: false, creado: '2026-01-01T00:00:00.000Z' });
const fiados = (nombre: string): Fiados => ({ clientes: [cliente(nombre)], movimientos: [] });
const ana = fiados('Ana');
const beto = fiados('Beto');
const carla = fiados('Carla');

const subidas = () => invocar.mock.calls.filter(([cmd]) => cmd === 'respaldo_subir');
const clientesSubidos = () => subidas().map(([, args]) => (JSON.parse(String(args?.contenido)) as { fiados: Fiados }).fiados.clientes[0]?.nombre);

beforeAll(() => vi.stubGlobal('window', new EventTarget()));
beforeEach(() => {
  almacen.clear();
  invocar.mockReset();
});

describe('contenidoRespaldo', () => {
  it('lleva los fiados completos bajo un tipo fijo', () => {
    expect(JSON.parse(contenidoRespaldo(ana))).toMatchObject({ tipo: 'motos-beto-fiados', version: 1, fiados: ana });
  });
});

describe('subirFiados', () => {
  it('sin cuenta conectada no sube y no marca nada pendiente', async () => {
    invocar.mockResolvedValue(null);
    await expect(subirFiados(ana)).resolves.toEqual({ estado: 'sin_repo' });
    expect(subidas()).toHaveLength(0);
    expect(almacen.has('estado')).toBe(false);
  });

  it('si GitHub falla queda pendiente con el motivo, sin reintentar en bucle', async () => {
    invocar.mockImplementation(async (cmd) => {
      if (cmd === 'respaldo_estado') return 'felipe/fiados';
      throw 'GitHub no responde';
    });
    await expect(subirFiados(ana)).resolves.toEqual({ estado: 'error', error: 'GitHub no responde' });
    expect(await leerEstadoRespaldo()).toMatchObject({ pendiente: true, error: 'GitHub no responde' });
    expect(subidas()).toHaveLength(1);
  });

  it('mientras sube, los cambios del medio se saltean: va sólo la versión más nueva', async () => {
    const sueltas: Array<() => void> = [];
    invocar.mockImplementation(async (cmd) => {
      if (cmd === 'respaldo_estado') return 'felipe/fiados';
      await new Promise<void>((ok) => sueltas.push(() => ok()));
    });
    const primera = subirFiados(ana);
    subirFiados(beto);
    const ultima = subirFiados(carla);
    await vi.waitFor(() => expect(sueltas).toHaveLength(1));
    expect(almacen.get('estado')).toMatchObject({ pendiente: true });
    sueltas[0]?.();
    await vi.waitFor(() => expect(sueltas).toHaveLength(2));
    sueltas[1]?.();
    await expect(ultima).resolves.toEqual({ estado: 'ok' });
    await expect(primera).resolves.toEqual({ estado: 'ok' });
    expect(clientesSubidos()).toEqual(['Ana', 'Carla']);
  });
});
