// Numbers the Uruguayan way: "1.234,5".

const whole = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('es-UY', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function km(meters: number): string {
  const value = Math.max(0, meters) / 1000;
  return `${value < 100 ? oneDecimal.format(value) : whole.format(value)} km`;
}

export function kmh(speed: number | null): string {
  return speed === null ? '— km/h' : `${whole.format(Math.max(0, speed))} km/h`;
}

export function count(n: number): string {
  return whole.format(n);
}

export function percent(share: number): string {
  return `${whole.format(Math.round(share * 100))} %`;
}

/** A number with the given decimals, the Uruguayan way: "1.234,5". */
export function number(value: number, decimals = 0): string {
  return new Intl.NumberFormat('es-UY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** Up to the given decimals, only when there are: 160 → "160", 12.5 → "12,5". */
export function decimal(value: number, decimals = 1): string {
  return new Intl.NumberFormat('es-UY', { maximumFractionDigits: decimals }).format(value);
}

/** «a», «a y b», «a, b y c». */
export function andList(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** "$ 41.000" in pesos, "US$ 1.250,50" in dollars: cents only when there are. */
export function money(value: number, currency: 'UYU' | 'USD'): string {
  const decimals = Number.isInteger(value) ? 0 : 2;
  return `${currency === 'USD' ? 'US$' : '$'} ${number(value, decimals)}`;
}
