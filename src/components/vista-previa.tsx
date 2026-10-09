import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, PDFWorker, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { LoaderCircle } from 'lucide-react';
import { generarPdf } from '@/pdf/generar';
import type { DatosPresupuesto } from '@/pdf/PresupuestoPDF';
import { cn } from '@/lib/utils';

GlobalWorkerOptions.workerSrc = workerUrl;
// Un solo worker para toda la sesión: cada actualización de la vista previa lo reutiliza.
let worker: PDFWorker | null = null;

const DEBOUNCE_MS = 400;

/**
 * Genera el PDF real con @react-pdf (el mismo que se guarda) y lo dibuja con pdf.js como hojas A4.
 * Dibuja en lienzos nuevos y recién después los cambia, así no parpadea mientras se escribe.
 */
export function VistaPrevia({ datos }: { datos: DatosPresupuesto }) {
  const marco = useRef<HTMLDivElement>(null);
  const hojas = useRef<HTMLDivElement>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [ancho, setAncho] = useState(0);
  const [ocupado, setOcupado] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = marco.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round((e?.contentRect.width ?? 0) / 8) * 8));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let vigente = true;
    setOcupado(true);
    const t = setTimeout(() => {
      generarPdf(datos)
        .then((b) => vigente && (setBytes(b), setError(null)))
        .catch((e: unknown) => vigente && (setError(String(e)), setOcupado(false)));
    }, DEBOUNCE_MS);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [datos]);

  useEffect(() => {
    if (!bytes || ancho < 50 || !hojas.current) return;
    let vigente = true;
    const destino = hojas.current;
    // pdf.js se queda con el buffer: se le pasa una copia.
    const tarea = getDocument({ data: bytes.slice(), worker: (worker ??= new PDFWorker()) });
    (async () => {
      try {
        const doc = await tarea.promise;
        const lienzos: HTMLCanvasElement[] = [];
        const dpr = window.devicePixelRatio || 1;
        for (let n = 1; n <= doc.numPages; n++) {
          const pagina = await doc.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const vp = pagina.getViewport({ scale: (ancho / base.width) * dpr });
          const c = document.createElement('canvas');
          c.width = Math.floor(vp.width);
          c.height = Math.floor(vp.height);
          c.style.width = '100%';
          c.className = 'block rounded-[2px] shadow-hoja';
          await pagina.render({ canvas: c, viewport: vp }).promise;
          lienzos.push(c);
        }
        if (vigente) {
          destino.replaceChildren(...lienzos);
          setOcupado(false);
        }
      } finally {
        await tarea.destroy();
      }
    })().catch((e: unknown) => vigente && (setError(String(e)), setOcupado(false)));
    return () => {
      vigente = false;
    };
  }, [bytes, ancho]);

  return (
    <div className="relative h-full overflow-y-auto rounded-lg bg-gris-claro/70 px-6 py-6 ring-1 ring-gris-plano/70 ring-inset">
      <div ref={marco} className="mx-auto w-full max-w-[640px]">
        <div ref={hojas} className="grid gap-5" aria-label="Vista previa del presupuesto" role="img" />
        {!bytes && !error && <div className="aspect-[210/297] w-full animate-pulse rounded-[2px] bg-papel-alto shadow-hoja" />}
        {error && (
          <p role="alert" className="rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
            No se pudo generar la vista previa: {error}
          </p>
        )}
      </div>
      <div
        className={cn(
          'pointer-events-none sticky bottom-0 ml-auto flex w-fit items-center gap-1.5 rounded-full bg-tinta/85 px-2.5 py-1 text-[11px] font-medium text-papel-alto transition-opacity duration-200',
          ocupado && bytes ? 'opacity-100' : 'opacity-0',
        )}
      >
        <LoaderCircle className="size-3 animate-spin" /> Actualizando
      </div>
    </div>
  );
}
