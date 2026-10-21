import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { receiptFromRow } from '../lib/fuel';
import { type RoadPoint, type TankReference, type TollMovement, type TollRate, roadVehicleKey } from '../lib/road';
import { ConflictError, DataError } from './api';

function checked<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new DataError(r.error.message, r.error.code);
  if (r.data === null) throw new DataError('No llegó la respuesta. Volvé a intentar.');
  return r.data;
}
async function complete<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; from <= 50000; from += 1000) {
    const part = checked(await page(from, from + 999));
    if (out.length + part.length > 50000) throw new DataError('Demasiados registros para calcular una cuenta completa.');
    out.push(...part);
    if (part.length < 1000) return out;
  }
  throw new DataError('No se pudo leer la cuenta completa.');
}
export const useRoadPoints = () =>
  useQuery({
    queryKey: ['roadPoints'],
    queryFn: () => complete((a, b) => supabase.from('trf_road_points').select('*').eq('archived', false).order('id').range(a, b)),
    staleTime: 30000,
  });
export function useRoadAccount(key: string | null) {
  return useQuery({
    queryKey: ['roadAccount', key],
    enabled: !!key,
    refetchInterval: 15000,
    queryFn: async () => {
      const [movements, rates, events, tank] = await Promise.all([
        complete((a, b) => supabase.from('trf_toll_movements').select('*').eq('vehicle_key', key!).order('id').range(a, b)),
        complete((a, b) => supabase.from('trf_toll_rates').select('*').eq('vehicle_key', key!).order('id').range(a, b)),
        supabase
          .from('trf_road_events')
          .select('*')
          .eq('vehicle_key', key!)
          .order('happened_at', { ascending: false })
          .limit(30)
          .then(checked),
        supabase.from('trf_tank_references').select('*').eq('vehicle_key', key!).then(checked),
      ]);
      return { movements, rates, events, tank: tank[0] ?? null };
    },
  });
}
export function useTankObservations(key: string | null) {
  return useQuery({
    queryKey: ['tankObservations', key],
    enabled: !!key,
    refetchInterval: 30000,
    queryFn: async () => {
      const [trips, fuel] = await Promise.all([
        complete((a, b) => supabase.from('trf_driver_tracking_sessions').select('id,vehicle,distance_meters').order('id').range(a, b)),
        complete((a, b) => supabase.from('trf_driver_fuel_receipts').select('*').order('id').range(a, b)),
      ]);
      return {
        trips: trips.filter((t) => roadVehicleKey(t.vehicle) === key),
        receipts: fuel
          .map((r) => receiptFromRow(r))
          .filter((r) => !r.archived && r.vehicle && roadVehicleKey(r.vehicle) === key)
          .map((r) => ({ id: r.id, vehicle: r.vehicle!, liters: r.liters })),
      };
    },
  });
}
export type RoadWrite =
  | { type: 'point'; row: RoadPoint; before: string | null }
  | { type: 'rate'; row: TollRate }
  | { type: 'movement'; row: TollMovement }
  | { type: 'tank'; row: TankReference; before: string | null };
export async function saveRoad(write: RoadWrite) {
  if (write.type === 'point' || write.type === 'tank') {
    const result =
      write.type === 'point'
        ? await (write.before
            ? supabase.from('trf_road_points').update(write.row).eq('id', write.row.id).eq('updated_at', write.before).select()
            : supabase.from('trf_road_points').insert(write.row).select())
        : await (write.before
            ? supabase
                .from('trf_tank_references')
                .update(write.row)
                .eq('vehicle_key', write.row.vehicle_key)
                .eq('updated_at', write.before)
                .select()
            : supabase.from('trf_tank_references').insert(write.row).select());
    if (!result.error && result.data.length) return;
    const saved =
      write.type === 'point'
        ? checked(await supabase.from('trf_road_points').select('*').eq('id', write.row.id))
        : checked(await supabase.from('trf_tank_references').select('*').eq('vehicle_key', write.row.vehicle_key));
    // A lost answer is safe to retry; compare all editable fields, not the server's audit timestamp.
    const same =
      saved[0] &&
      Object.entries(write.row).every(
        ([k, v]) =>
          ['updated_at', 'created_at', 'measured_at'].includes(k) ||
          JSON.stringify((saved[0] as unknown as Record<string, unknown>)[k]) === JSON.stringify(v),
      );
    if (same) return;
    if (result.error && result.error.code !== '23505') checked(result);
    throw new ConflictError('Otra persona cambió este registro. Cerrá y volvé a abrir para revisarlo.');
  }
  const table = write.type === 'rate' ? 'trf_toll_rates' : 'trf_toll_movements';
  const result =
    write.type === 'rate'
      ? await supabase.from('trf_toll_rates').insert(write.row).select()
      : await supabase.from('trf_toll_movements').insert(write.row).select();
  if (!result.error) return;
  const existing = checked(await supabase.from(table).select('id').eq('id', write.row.id));
  if (existing.length) return; // One immutable UUID per attempt; retries cannot charge twice.
  checked(result);
}
export function useRoadWrite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveRoad,
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['roadPoints'] }), client.invalidateQueries({ queryKey: ['roadAccount'] })]);
    },
  });
}
