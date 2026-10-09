import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { KeyRound, LogIn, Trash2 } from 'lucide-react';
import { EncabezadoSeccion } from '@/components/acciones';
import { Campo, invalido } from '@/components/campo';
import { InputNumero } from '@/components/inputs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { IVA_POR_DEFECTO } from '@/lib/cba';
import { useConfig } from '@/lib/config';
import { enTauri } from '@/lib/entorno';
import { borrarCuenta, guardarCuenta, PROVEEDORES, usuarioGuardado, type Proveedor as DatosProveedor } from '@/lib/proveedores';
import { configSchema } from '@/lib/schema';

const ivaSchema = configSchema.shape.ivaProveedores.unwrap().valueType;

export function Proveedores() {
  return (
    <>
      <EncabezadoSeccion titulo="Proveedores" descripcion="Las páginas donde se buscan los precios de repuestos. El IVA de cada una se suma al precio de lista." />
      <div className="grid gap-4">
        {PROVEEDORES.map((p) => (
          <Proveedor key={p.id} {...p} />
        ))}
      </div>
    </>
  );
}

function Proveedor({ id, nombre, sitio, login }: DatosProveedor) {
  const { config, actualizar } = useConfig();
  const guardado = config.ivaProveedores[id] ?? IVA_POR_DEFECTO;
  const [iva, setIva] = useState(guardado);
  const [error, setError] = useState<string>();

  useEffect(() => setIva(guardado), [guardado]);

  const guardar = () => {
    const r = ivaSchema.safeParse(iva);
    if (!r.success) return setError(Number.isNaN(iva) ? 'Ingresá un número' : r.error.issues[0]?.message);
    setError(undefined);
    if (r.data !== guardado) actualizar((c) => ({ ...c, ivaProveedores: { ...c.ivaProveedores, [id]: r.data } }));
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between px-5">
        <div className="grid gap-1">
          <CardTitle>{nombre}</CardTitle>
          <CardDescription>{sitio}</CardDescription>
        </div>
        {enTauri && (
          <Button variant="outline" onClick={() => login().catch((e: unknown) => toast.error('No se pudo abrir el login', { description: String(e) }))}>
            <LogIn /> Entrar a mano
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-5 px-5">
        <div className="flex items-start gap-5">
          <Campo id={`iva-${id}`} label="IVA a sumar" error={error} className="w-44">
            <InputNumero id={`iva-${id}`} value={iva} sufijo="%" onValueChange={setIva} onBlur={guardar} {...invalido(`iva-${id}`, error)} />
          </Campo>
          <p className="mt-8 font-texto text-sm text-tinta-gris">La página muestra los precios sin IVA. Poné 0 si no querés sumarlo.</p>
        </div>
        {enTauri && <Cuenta id={id} nombre={nombre} />}
      </CardContent>
    </Card>
  );
}

/** Usuario y contraseña para que la app entre sola. La contraseña se escribe pero nunca se vuelve a mostrar. */
function Cuenta({ id, nombre }: Pick<DatosProveedor, 'id' | 'nombre'>) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [guardada, setGuardada] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    usuarioGuardado(id)
      .then((u) => {
        setGuardada(u);
        setUsuario(u ?? '');
      })
      .catch((e: unknown) => setError(String(e)));
  }, [id]);

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!usuario.trim() || !clave) return setError('Completá usuario y contraseña.');
    guardarCuenta(id, usuario, clave)
      .then(() => {
        setGuardada(usuario.trim());
        setClave('');
        setError(undefined);
        toast.success(`Cuenta de ${nombre} guardada`);
      })
      .catch((e: unknown) => setError(String(e)));
  };

  const borrar = () =>
    borrarCuenta(id)
      .then(() => {
        setGuardada(null);
        setUsuario('');
        setClave('');
        toast.success(`Cuenta de ${nombre} borrada`);
      })
      .catch((e: unknown) => setError(String(e)));

  return (
    <form onSubmit={guardar} className="grid gap-3 border-t border-gris-plano pt-4">
      <p className="text-sm text-tinta-gris">
        {guardada ? (
          <>
            La app entra sola como <span className="font-semibold text-tinta">{guardada}</span>. Para cambiarla, escribí la contraseña de nuevo.
          </>
        ) : (
          'Guardá usuario y contraseña para que la app entre sola (si falla, queda «Entrar a mano»). Quedan cifradas en Windows, no en los backups.'
        )}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Campo id={`usuario-${id}`} label="Usuario" className="w-64">
          <Input id={`usuario-${id}`} value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="off" spellCheck={false} />
        </Campo>
        <Campo id={`clave-${id}`} label="Contraseña" error={error} className="w-64">
          <Input
            id={`clave-${id}`}
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder={guardada ? '••••••••' : ''}
            autoComplete="new-password"
            {...invalido(`clave-${id}`, error)}
          />
        </Campo>
        <Button type="submit">
          <KeyRound /> Guardar cuenta
        </Button>
        {guardada && (
          <Button type="button" variant="ghost" onClick={() => void borrar()}>
            <Trash2 /> Borrar
          </Button>
        )}
      </div>
    </form>
  );
}
