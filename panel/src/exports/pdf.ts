// PDF files: the trip list on landscape pages, and one trip as a load order to print or send.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { DocumentRow } from '../data/api';
import { formatDay, formatDayTime, formatDuration } from '../lib/dates';
import { money, number } from '../lib/format';
import { documentLabel, PRINT_HEADERS, printRow, sourceLabel, totalsText, tripFacts, tripTotals } from '../lib/tripTable';
import type { Fuel, RouteStats, Trip } from '../lib/trips';
import { COMPANY, generated, type ListInfo, NAVY, save } from './common';

// The standard PDF fonts cover the Spanish letters (á, ñ, ¿) but not arrows or emoji: the texts avoid them.
const INK: [number, number, number] = [17, 28, 46];
const SOFT: [number, number, number] = [79, 93, 115];

function header(doc: jsPDF, title: string, subtitle: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(COMPANY.toUpperCase(), 14, 14);
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(title, 14, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...SOFT);
  doc.text(subtitle, 14, 28);
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(103, 117, 139);
    const h = doc.internal.pageSize.getHeight();
    const w = doc.internal.pageSize.getWidth();
    doc.text(generated(), 14, h - 8);
    doc.text(`Página ${i} de ${pages}`, w - 14, h - 8, { align: 'right' });
  }
}

export function pdfList(trips: readonly Trip[], info: ListInfo): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  header(doc, info.title, info.subtitle);
  autoTable(doc, {
    startY: 33,
    head: [PRINT_HEADERS],
    body: trips.map(printRow),
    foot: [[{ content: `Totales: ${totalsText(tripTotals(trips))}`, colSpan: PRINT_HEADERS.length }]],
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak', textColor: INK },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [238, 242, 247], textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    margin: { left: 10, right: 10, bottom: 14 },
  });
  footer(doc);
  save(doc.output('blob'), `${info.fileBase}.pdf`);
}

export interface TripExtras {
  documents: readonly DocumentRow[];
  fuel: readonly Fuel[];
  stats: RouteStats | null;
}

export function pdfTrip(trip: Trip, extras: TripExtras, fileBase: string): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const day = trip.departureAt ? formatDayTime(Date.parse(trip.departureAt)) : '';
  header(doc, trip.orderNumber ? `Orden de carga ${trip.orderNumber}` : 'Orden de carga', [day, sourceLabel(trip), trip.status.label].filter(Boolean).join(' · '));
  const next = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const table = (head: string[], body: string[][]) =>
    autoTable(doc, {
      startY: next(),
      head: [head],
      body,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: INK },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      margin: { left: 14, right: 14, bottom: 14 },
    });
  autoTable(doc, {
    startY: 34,
    body: tripFacts(trip),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 1.8, textColor: INK },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42, textColor: SOFT } },
    margin: { left: 14, right: 14 },
  });
  const s = extras.stats;
  if (s && s.count > 0) {
    table(['Recorrido GPS', ''], [
      ['Puntos registrados', number(s.count)],
      ['Duración', s.durationMs === null ? '—' : formatDuration(s.durationMs)],
      ['Velocidad máxima', s.maxSpeedKmh === null ? '—' : `${number(s.maxSpeedKmh)} km/h`],
    ]);
  }
  if (extras.documents.length > 0) {
    table(['Remito', 'Tipo de carga', 'Kilos'], extras.documents.map((d) => [documentLabel(d), d.cargo_type || '—', d.kg === null ? '—' : number(d.kg, 0)]));
  }
  if (extras.fuel.length > 0) {
    table(['Combustible', 'Fecha', 'Litros', 'Importe'], extras.fuel.map((f) => [f.station ?? 'Estación sin indicar', f.date ? formatDay(f.date) : '—', f.liters === null ? '—' : number(f.liters, 1), f.total === null ? '—' : money(f.total, f.currency)]));
  }
  if (trip.notes) table(['Notas'], [[trip.notes]]);
  footer(doc);
  save(doc.output('blob'), `${fileBase}.pdf`);
}
