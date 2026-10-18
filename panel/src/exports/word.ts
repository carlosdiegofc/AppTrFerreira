// The trip list as a Word document on landscape pages, to edit or add to a report.
import { AlignmentType, BorderStyle, Document, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { PRINT_HEADERS, printRow, totalsText, tripTotals } from '../lib/tripTable';
import type { Trip } from '../lib/trips';
import { COMPANY, generated, type ListInfo, save } from './common';

const cell = (text: string, bold = false) =>
  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold, size: 16, font: 'Calibri' })] })], margins: { top: 40, bottom: 40, left: 60, right: 60 } });

export async function word(trips: readonly Trip[], info: ListInfo): Promise<void> {
  const line = { style: BorderStyle.SINGLE, size: 4, color: 'D5DDE8' };
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: [
      new TableRow({ tableHeader: true, children: PRINT_HEADERS.map((h) => cell(h, true)) }),
      ...trips.map((t) => new TableRow({ children: printRow(t).map((v) => cell(v)) })),
    ],
  });
  const doc = new Document({
    creator: COMPANY,
    title: info.title,
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: [
          new Paragraph({ children: [new TextRun({ text: COMPANY.toUpperCase(), bold: true, size: 18, color: '0F2142', font: 'Calibri' })] }),
          new Paragraph({ children: [new TextRun({ text: info.title, bold: true, size: 30, font: 'Calibri' })] }),
          new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: info.subtitle, size: 19, color: '4F5D73', font: 'Calibri' })] }),
          table,
          new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: `Totales: ${totalsText(tripTotals(trips))}`, bold: true, size: 18, font: 'Calibri' })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: generated(), size: 15, color: '67758B', font: 'Calibri' })] }),
        ],
      },
    ],
  });
  save(await Packer.toBlob(doc), `${info.fileBase}.docx`);
}
