import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CloudUpload, LogIn, LogOut } from 'lucide-react';
import { EncabezadoSeccion } from '@/components/acciones';
import { Campo } from '@/components/campo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { enTauri } from '@/lib/entorno';
import { useFiados } from '@/lib/fiados-store';
import { conectarRespaldo, desconectarRespaldo, EVENTO_RESPALDO, leerEstadoRespaldo, repoConectado, respaldarSinEsperar, subirFiados, type EstadoRespaldo } from '@/lib/respaldo';

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export function Respaldo() {
  const [repo, setRepo] = useState<string | null>();
  const [estado, setEstado] = useState<EstadoRespaldo>();

  const cargar = useCallback(() => {
    repoConectado().then(setRepo).catch((e: unknown) => toast.error('No se pudo leer la cuenta de GitHub', { description: String(e) }));
    leerEstadoRespaldo().then(setEstado);
  }, []);

  useEffect(() => {
    if (!enTauri) return;
    cargar();
    window.addEventListener(EVENTO_RESPALDO, cargar);
    return () => window.removeEventListener(EVENTO_RESPALDO, cargar);
  }, [cargar]);

  return (
    <>
      <EncabezadoSeccion
        titulo="Respaldo de fiados"
        descripcion="Cada cambio en los fiados se guarda en esta computadora y, con una cuenta conectada, se sube solo a un repositorio privado de GitHub. Si no hay internet, queda pendiente y se sube con el próximo cambio o con «Subir ahora»."
      />
      {!enTauri && <p className="text-sm text-tinta-gris">Disponible sólo en la app de escritorio.</p>}
      {enTauri && repo !== undefined && (repo ? <Conectada repo={repo} estado={estado} /> : <Conectar alConectar={cargar} />)}
    </>
  );
}

function Conectar({ alConectar }: { alConectar: () => void }) {
  const { fiados } = useFiados();
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string>();
  const [conectando, setConectando] = useState(false);

  const conectar = (e: FormEvent) => {
    e.preventDefault();
    if (!repo.trim() || !token) return setError('Completá el repositorio y el token.');
    setError(undefined);
    setConectando(true);
    conectarRespaldo(repo, token)
      .then((r) => {
        setToken('');
        toast.success(`Conectado a ${r}`);
        alConectar();
        // La primera copia sale enseguida, así el repositorio arranca con los fiados de hoy.
        if (fiados) respaldarSinEsperar(fiados);
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setConectando(false));
  };

  return (
    <Card>
      <CardHeader className="px-5">
        <CardTitle>Iniciar sesión en GitHub</CardTitle>
        <CardDescription>Usá un token que sólo tenga acceso a un repositorio privado.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 px-5">
        <ol className="grid list-decimal gap-1 pl-5 font-texto text-sm text-tinta-media">
          <li>
            Creá un repositorio <b>privado</b> en GitHub (podés tildar «Add a README file»).
          </li>
          <li>
            En GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens. Permiso <b>Contents: Read and write</b>, sólo para ese repositorio.
          </li>
          <li>Pegá acá el repositorio (usuario/nombre) y el token. Se guardan cifrados en Windows, no en los backups.</li>
        </ol>
        <form onSubmit={conectar} className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Campo id="respaldo-repo" label="Repositorio" className="w-72">
              <Input id="respaldo-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="usuario/fiados-motos-beto" autoComplete="off" spellCheck={false} />
            </Campo>
            <Campo id="respaldo-token" label="Token de acceso" className="w-72">
              <Input id="respaldo-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" />
            </Campo>
            <Button type="submit" disabled={conectando}>
              <LogIn /> Iniciar sesión
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Conectada({ repo, estado }: { repo: string; estado?: EstadoRespaldo }) {
  const { fiados } = useFiados();
  const [subiendo, setSubiendo] = useState(false);

  const subirAhora = () => {
    if (!fiados) return;
    setSubiendo(true);
    subirFiados(fiados)
      .then((r) => {
        if (r?.estado === 'ok') toast.success('Fiados subidos a GitHub');
        if (r?.estado === 'error') toast.error('No se pudo subir a GitHub', { description: r.error, duration: 10000 });
      })
      .finally(() => setSubiendo(false));
  };

  const desconectar = () =>
    desconectarRespaldo()
      .then(() => toast.success('Sesión de GitHub cerrada'))
      .catch((e: unknown) => toast.error('No se pudo cerrar la sesión', { description: String(e) }));

  return (
    <Card>
      <CardHeader className="flex items-center justify-between px-5">
        <div className="grid gap-1">
          <CardTitle>{repo}</CardTitle>
          <CardDescription>Repositorio de GitHub</CardDescription>
        </div>
        <Button variant="ghost" onClick={() => void desconectar()}>
          <LogOut /> Cerrar sesión
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 px-5">
        <p className="text-sm text-tinta-gris">
          {estado?.ultimaSubida ? (
            <>
              Última subida: <span className="font-semibold text-tinta">{fechaHora(estado.ultimaSubida)}</span>
            </>
          ) : (
            'Todavía no se subió ninguna copia.'
          )}
        </p>
        {estado?.pendiente && <p className="text-sm text-error">Hay cambios sin subir{estado.error && `: ${estado.error}`}</p>}
        <Button className="justify-self-start" onClick={subirAhora} disabled={subiendo || !fiados}>
          <CloudUpload /> {subiendo ? 'Subiendo…' : 'Subir ahora'}
        </Button>
      </CardContent>
    </Card>
  );
}
