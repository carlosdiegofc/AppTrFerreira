// Files the office downloads from Viajes. Each format loads its own library only when that file is asked for, so the
// panel stays light and a PDF does not bring the Word library along.
import type { Trip } from '../lib/trips';
import type { ListInfo } from './common';
import type { TripExtras } from './pdf';

export type { ListInfo } from './common';
export type ListFormat = 'xlsx' | 'pdf' | 'docx';

/** The list the office is looking at, as a file. */
export async function downloadTrips(format: ListFormat, trips: readonly Trip[], info: ListInfo): Promise<void> {
  if (format === 'xlsx') await (await import('./excel')).excel(trips, info);
  else if (format === 'pdf') (await import('./pdf')).pdfList(trips, info);
  else await (await import('./word')).word(trips, info);
}

/** One trip as a load order, to print or send. */
export async function downloadTripPdf(trip: Trip, extras: TripExtras, fileBase: string): Promise<void> {
  (await import('./pdf')).pdfTrip(trip, extras, fileBase);
}
