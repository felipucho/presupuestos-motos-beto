import { isTauri } from '@tauri-apps/api/core';

/** Falso en el navegador (vite, sólo para desarrollar la interfaz): ahí no hay archivos ni diálogos del sistema. */
export const enTauri = isTauri();
