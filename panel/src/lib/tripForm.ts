// The office's form for a trip: what it starts with, what it checks and what it saves in trf_panel_trips. Same rules as
// web/js/trips.js (formValues, validateTripForm), so both panels save a trip alike. Pure functions.
import type { TablesUpdate } from './database.types';
import { fromZoneInput, toZoneInput } from './dates';
import { text as cleanText } from './fleet';
import { decimal } from './format';
import { parseNumber } from './numbers';
import { validPosition } from './route';
import { EMPTY_RETURN, type LatLng, type Trip } from './trips';

/** Longest text each column takes (the database checks the same limits). */
export const LIMITS = { order_number: 60, product: 120, client: 160, origin_name: 200, destination_name: 200, driver_name: 120, vehicle: 120, notes: 2000 } as const;
const MAX = { billable_km: 5000, kg: 100000, amount: 1e9 } as const;

/** "app": the GPS dates and the driver come from the phone and are not sent. "manual": a trip typed in the panel. */
export type FormMode = 'app' | 'manual';

export const formMode = (trip: Pick<Trip, 'source'> | null): FormMode => (trip?.source === 'app' ? 'app' : 'manual');

/** What the form shows, as typed text. */
export interface TripFormValues {
  order_number: string;
  client: string;
  product: string;
  origin_name: string;
  origin: LatLng | null;
  destination_name: string;
  destination: LatLng | null;
  vehicle: string;
  driver_name: string;
  /** <input type="datetime-local"> text, in Uruguay. */
  departure_at: string;
  arrival_at: string;
  billable_km: string;
  kg: string;
  amount: string;
  currency: 'UYU' | 'USD';
  notes: string;
}

export type FormField = keyof typeof LIMITS | 'billable_km' | 'kg' | 'amount' | 'currency' | 'departure_at' | 'arrival_at';
export type TripPayload = TablesUpdate<'trf_panel_trips'>;

const numberText = (value: number | null, decimals: number) => (value === null ? '' : decimal(value, decimals));

/**
 * What the office sees when opening the form: the trip as it is shown (what the office completed, else what the phone
 * sent). A new trip typed by hand starts at the current minute.
 */
export function formValues(trip: Trip | null, now = Date.now()): TripFormValues {
  return {
    order_number: trip?.orderNumber ?? '',
    client: trip?.client ?? '',
    // The empty return the screen shows for an empty trip is not something the office typed.
    product: trip?.product === EMPTY_RETURN && trip.loadType === 'empty' ? '' : (trip?.product ?? ''),
    origin_name: trip?.originName ?? '',
    origin: trip?.origin ?? null,
    destination_name: trip?.destinationName ?? '',
    destination: trip?.destination ?? null,
    vehicle: trip?.vehicle ?? '',
    driver_name: trip?.driverName ?? '',
    departure_at: toZoneInput(trip ? trip.departureAt : new Date(Math.floor(now / 60_000) * 60_000).toISOString()),
    arrival_at: toZoneInput(trip?.arrivalAt),
    billable_km: numberText(trip?.billableKm ?? null, 1),
    kg: numberText(trip?.kg ?? null, 1),
    amount: numberText(trip?.amount ?? null, 2),
    currency: trip?.currency ?? 'UYU',
    notes: trip?.notes ?? '',
  };
}

export interface FormCheck {
  ok: boolean;
  errors: Partial<Record<FormField, string>>;
  /** Ready for trf_panel_trips. */
  payload: TripPayload;
}

/** Checks the form and turns it into the row to save. Manual trips need the departure and the truck. */
export function validateTripForm(input: TripFormValues, mode: FormMode): FormCheck {
  const errors: FormCheck['errors'] = {};
  const payload: TripPayload = {};

  const text = (field: keyof typeof LIMITS) => {
    const v = cleanText(input[field]);
    if (v !== null && v.length > LIMITS[field]) errors[field] = `Máximo ${LIMITS[field]} caracteres.`;
    payload[field] = v;
  };
  for (const field of ['order_number', 'client', 'product', 'origin_name', 'destination_name', 'vehicle', 'notes'] as const) text(field);

  const number = (field: keyof typeof MAX, decimals: number) => {
    const parsed = parseNumber(input[field]);
    if (!parsed.ok) {
      errors[field] = parsed.error;
      payload[field] = null;
      return;
    }
    if (parsed.value !== null && parsed.value > MAX[field]) errors[field] = `Revisá el valor: supera ${decimal(MAX[field], 0)}.`;
    payload[field] = parsed.value === null ? null : Number(parsed.value.toFixed(decimals));
  };
  number('billable_km', 1);
  number('kg', 1);
  number('amount', 2);

  if (input.currency !== 'UYU' && input.currency !== 'USD') errors.currency = 'Elegí pesos o dólares.';
  payload.currency = input.currency;

  const place = (value: LatLng | null, prefix: 'origin' | 'destination') => {
    payload[`${prefix}_lat`] = null;
    payload[`${prefix}_lng`] = null;
    if (value === null) return;
    if (!validPosition(value[0], value[1])) {
      errors[`${prefix}_name`] = 'La ubicación del mapa no es válida: quitala y volvé a guardar.';
      return;
    }
    payload[`${prefix}_lat`] = value[0];
    payload[`${prefix}_lng`] = value[1];
  };
  place(input.origin, 'origin');
  place(input.destination, 'destination');

  if (mode === 'manual') {
    text('driver_name');
    const departure = fromZoneInput(input.departure_at);
    const arrival = fromZoneInput(input.arrival_at);
    if (departure === undefined) errors.departure_at = 'Fecha y hora no válidas.';
    else if (departure === null) errors.departure_at = 'Indicá la fecha y hora de salida.';
    if (arrival === undefined) errors.arrival_at = 'Fecha y hora no válidas.';
    else if (departure && arrival && Date.parse(arrival) < Date.parse(departure)) errors.arrival_at = 'La llegada no puede ser antes de la salida.';
    payload.departure_at = departure ?? null;
    payload.arrival_at = arrival ?? null;
    if (!payload.vehicle) errors.vehicle = 'Indicá el camión.';
  }
  return { ok: Object.keys(errors).length === 0, errors, payload };
}

/** The form changed since it was opened (what decides whether closing it asks first). */
export function formChanged(a: TripFormValues, b: TripFormValues): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
