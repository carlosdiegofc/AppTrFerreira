// Additive contract for migration 0005; production-generated types remain unchanged until deployment.
import type { Database } from './database.types';
import type { RoadPoint, TollRate, TollMovement, RoadEvent, TankReference } from './road';
type Table<T> = { Row: { [K in keyof T]: T[K] }; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
export type RoadDatabase = Database & { public: { Tables: {
  trf_road_points: Table<RoadPoint>;
  trf_toll_rates: Table<TollRate>;
  trf_toll_movements: Table<TollMovement>;
  trf_road_events: Table<RoadEvent>;
  trf_tank_references: Table<TankReference>;
} } };

