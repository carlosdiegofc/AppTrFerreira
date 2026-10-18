// The trip list as an Excel spreadsheet: every column, real dates and numbers, the header fixed.
import writeXlsxFile from 'write-excel-file/browser';
import { wallClock } from '../lib/dates';
import { SHEET_COLUMNS } from '../lib/tripTable';
import type { Trip } from '../lib/trips';
import { type ListInfo, save } from './common';

export async function excel(trips: readonly Trip[], info: ListInfo): Promise<void> {
  const header = SHEET_COLUMNS.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
  const rows = trips.map((t) =>
    SHEET_COLUMNS.map((c) => {
      const v = c.value(t);
      if (v === null || v === '') return null;
      if (c.kind === 'datetime') return { value: wallClock(Date.parse(String(v))), type: Date, format: 'dd/mm/yyyy hh:mm' };
      if (c.kind === 'number') return { value: Number(v), type: Number, format: c.decimals ? `#,##0.${'0'.repeat(c.decimals)}` : '#,##0' };
      return { value: String(v), type: String };
    }),
  );
  const blob = await writeXlsxFile([header, ...rows], { sheet: 'Viajes', columns: SHEET_COLUMNS.map((c) => ({ width: c.width })), stickyRowsCount: 1 }).toBlob();
  save(blob, `${info.fileBase}.xlsx`);
}
