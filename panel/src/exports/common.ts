// Shared pieces of the downloaded files: the company name, its navy and how a file is handed to the browser.
import { formatDayTime } from '../lib/dates';

export interface ListInfo {
  /** "Viajes del 19/09/2026 al 18/10/2026". */
  title: string;
  /** What the list shows: "Pendientes · Camión GTP4265". */
  subtitle: string;
  /** File name without extension. */
  fileBase: string;
}

export const COMPANY = 'Transportes Ferreira';
// Navy of the panel's bar, for headings and table headers.
export const NAVY: [number, number, number] = [15, 33, 66];

export function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the link stops working.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const generated = () => `Generado el ${formatDayTime(Date.now())}`;
