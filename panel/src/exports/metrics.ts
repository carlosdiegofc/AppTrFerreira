// Files the office downloads from Métricas: the table of the period, per truck or per driver, with the whole fleet at
// the end. Each format loads its library only when that file is asked for.
import type { Metrics } from '../lib/metrics';
import type { ListInfo } from './common';

export type MetricsFormat = 'xlsx' | 'pdf';

export interface MetricsInfo extends ListInfo {
  /** The header of the first column: "Camión" or "Chofer". */
  who: string;
}

export async function downloadMetrics(format: MetricsFormat, metrics: Metrics, info: MetricsInfo): Promise<void> {
  if (format === 'xlsx') await excel(metrics, info);
  else await pdf(metrics, info);
}

async function excel(metrics: Metrics, info: MetricsInfo) {
  const [{ default: writeXlsxFile }, { SHEET_COLUMNS }, { save }] = await Promise.all([import('write-excel-file/browser'), import('../lib/metricsTable'), import('./common')]);
  const bold = { fontWeight: 'bold' as const };
  const header = [{ value: info.who, ...bold }, ...SHEET_COLUMNS.map((c) => ({ value: c.header, ...bold }))];
  const line = (name: string, r: Metrics['total'], total = false) => [
    { value: name, type: String, ...(total ? bold : {}) },
    ...SHEET_COLUMNS.map((c) => {
      const v = c.value(r);
      return v === null ? null : { value: v, type: Number, format: c.decimals ? `#,##0.${'0'.repeat(c.decimals)}` : '#,##0', ...(total ? bold : {}) };
    }),
  ];
  const rows = [header, ...metrics.rows.map((r) => line(r.name, r)), line('Toda la flota', metrics.total, true)];
  const blob = await writeXlsxFile(rows, { sheet: 'Métricas', columns: [{ width: 34 }, ...SHEET_COLUMNS.map((c) => ({ width: c.width }))], stickyRowsCount: 1 }).toBlob();
  save(blob, `${info.fileBase}.xlsx`);
}

async function pdf(metrics: Metrics, info: MetricsInfo) {
  const [{ jsPDF }, { autoTable }, { TABLE_COLUMNS, METRICS_NOTE }, { footer, header, INK }, { NAVY, save }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('../lib/metricsTable'), import('./pdf'), import('./common')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  header(doc, info.title, info.subtitle);
  const cells = (name: string, r: Metrics['total']) => [name, ...TABLE_COLUMNS.map((c) => c.text(r))];
  autoTable(doc, {
    startY: 33,
    head: [[info.who, ...TABLE_COLUMNS.map((c) => c.header)]],
    body: metrics.rows.map((r) => cells(r.name, r)),
    foot: [cells('Toda la flota', metrics.total)],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, overflow: 'linebreak', textColor: INK },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [238, 242, 247], textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: Object.fromEntries(TABLE_COLUMNS.map((_, i) => [i + 1, { halign: 'right' as const }])),
    margin: { left: 10, right: 10, bottom: 14 },
  });
  // What each figure is, under the table (on a page of its own when the table fills the last one).
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  if (y > doc.internal.pageSize.getHeight() - 24) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(103, 117, 139);
  doc.text(doc.splitTextToSize(METRICS_NOTE, doc.internal.pageSize.getWidth() - 20), 10, y);
  footer(doc);
  save(doc.output('blob'), `${info.fileBase}.pdf`);
}
