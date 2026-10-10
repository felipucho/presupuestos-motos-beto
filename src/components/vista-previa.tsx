import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
  const scroll = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x: number; y: number; left: number; top: number; movio: boolean } | null>(null);
  const [ampliada, setAmpliada] = useState(false);

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
        // Sin las hojas viejas: mostrarían montos que ya no son los del formulario.
        .catch((e: unknown) => vigente && (hojas.current?.replaceChildren(), setBytes(null), setError(String(e)), setOcupado(false)));
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
        // Si mientras tanto llegó otra actualización, no se siguen rasterizando hojas que nadie va a mostrar.
        for (let n = 1; n <= doc.numPages && vigente; n++) {
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

  // Al ampliar, la hoja queda al medio (si no, pegada al borde). Al cerrar, la vista vuelve arriba.
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    el.scrollLeft = ampliada ? (el.scrollWidth - el.clientWidth) / 2 : 0;
    el.scrollTop = ampliada ? (el.scrollHeight - el.clientHeight) / 2 : 0;
  }, [ampliada]);

  // Tocar sin arrastrar alterna. Ampliada, también cuenta el fondo. Arrastrar la mueve, pero sólo ampliada.
  const alBajar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scroll.current;
    if (!el || (!ampliada && !hojas.current?.contains(e.target as Node))) return;
    arrastre.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, movio: false };
    el.setPointerCapture(e.pointerId);
  };
  const alMover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) a.movio = true;
    if (ampliada && scroll.current) {
      scroll.current.scrollLeft = a.left - dx;
      scroll.current.scrollTop = a.top - dy;
    }
  };
  const alSoltar = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (a && !a.movio) setAmpliada((v) => !v);
  };
  const alCancelar = () => {
    arrastre.current = null;
  };

  return (
    <div
      ref={scroll}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alCancelar}
      className={cn(
        ampliada
          ? 'fixed inset-0 z-50 flex overflow-auto overscroll-contain bg-tinta/80 p-4 touch-none select-none cursor-grab active:cursor-grabbing'
          : 'relative h-full overflow-y-auto rounded-lg bg-gris-claro/70 px-6 py-6 ring-1 ring-gris-plano/70 ring-inset cursor-zoom-in',
      )}
    >
      <div
        ref={marco}
        className={cn('w-full', ampliada ? 'm-auto shrink-0' : 'mx-auto max-w-[640px]')}
        style={ampliada ? { width: 'min(960px, 85vw)' } : undefined}
      >
        <div
          ref={hojas}
          className="grid gap-5"
          role="button"
          tabIndex={0}
          aria-pressed={ampliada}
          aria-label="Vista previa del presupuesto. Tocá para ampliar o cerrar"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && ampliada) {
              setAmpliada(false);
              return;
            }
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            setAmpliada((v) => !v);
          }}
        />
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
          ampliada && 'hidden',
        )}
      >
        <LoaderCircle className="size-3 animate-spin" /> Actualizando
      </div>
    </div>
  );
}
