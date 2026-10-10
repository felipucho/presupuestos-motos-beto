import { invoke } from '@tauri-apps/api/core';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/** 300 ppp: texto nítido en impresoras de tinta y láser. */
const DPI = 300;

/** Cada hoja del PDF como PNG en base64. Windows imprime hojas por GDI, no el PDF: por eso se rasteriza. */
export async function hojasPng(bytes: Uint8Array): Promise<string[]> {
  // pdf.js le quita el buffer al documento: se le pasa una copia.
  const tarea = getDocument({ data: bytes.slice() });
  const doc = await tarea.promise;
  try {
    const hojas: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const vp = pagina.getViewport({ scale: DPI / 72 });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.floor(vp.width);
      lienzo.height = Math.floor(vp.height);
      await pagina.render({ canvas: lienzo, viewport: vp }).promise;
      hojas.push(lienzo.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''));
    }
    return hojas;
  } finally {
    await tarea.destroy();
  }
}

/** Manda el PDF a la impresora, sin diálogo. `impresora` null usa la predeterminada de Windows. */
export const imprimirPdf = async (bytes: Uint8Array, impresora: string | null) => invoke<void>('imprimir_paginas', { impresora, paginas: await hojasPng(bytes) });

export const listarImpresoras = () => invoke<string[]>('impresoras');
