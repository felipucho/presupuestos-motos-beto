import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';
import { EncabezadoSeccion } from '@/components/acciones';
import { Campo, invalido } from '@/components/campo';
import { InputNumero } from '@/components/inputs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IVA_POR_DEFECTO, loginCba, PROVEEDORES } from '@/lib/cba';
import { useConfig } from '@/lib/config';
import { configSchema } from '@/lib/schema';

const ivaSchema = configSchema.shape.ivaProveedores.unwrap().valueType;

export function Proveedores() {
  return (
    <>
      <EncabezadoSeccion
        titulo="Proveedores"
        descripcion="Las páginas donde se buscan los precios de repuestos. El IVA de cada una se suma al precio de lista."
      />
      <div className="grid gap-4">
        {PROVEEDORES.map((p) => (
          <Proveedor key={p.id} {...p} />
        ))}
      </div>
    </>
  );
}

function Proveedor({ id, nombre, sitio }: (typeof PROVEEDORES)[number]) {
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
        <Button variant="outline" onClick={() => loginCba().catch((e: unknown) => toast.error('No se pudo abrir el login', { description: String(e) }))}>
          <LogIn /> Iniciar sesión
        </Button>
      </CardHeader>
      <CardContent className="flex items-start gap-5 px-5">
        <Campo id={`iva-${id}`} label="IVA a sumar" error={error} className="w-44">
          <InputNumero id={`iva-${id}`} value={iva} sufijo="%" onValueChange={setIva} onBlur={guardar} {...invalido(`iva-${id}`, error)} />
        </Campo>
        <p className="mt-8 font-texto text-sm text-tinta-gris">La página muestra los precios sin IVA. Poné 0 si no querés sumarlo.</p>
      </CardContent>
    </Card>
  );
}
