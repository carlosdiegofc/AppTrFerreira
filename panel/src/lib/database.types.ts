// Generated from the production database (Supabase type generator) on 2026-10-20, after migration 0004. Regenerate after
// every migration.
// trf_drivers, trf_driver_salaries and trf_driver_payments (migration 0008), and the tables of the later migrations, are
// written by hand in the generator's format until the next generation; the tables of migration 0005 are in
// roadDatabase.ts.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      trf_client_movements: {
        Row: {
          amount: number
          client_key: string
          client_name: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          happened_on: string
          id: string
          kind: string
          method: string | null
          notes: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          client_key: string
          client_name: string
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          happened_on: string
          id?: string
          kind: string
          method?: string | null
          notes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          client_key?: string
          client_name?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          happened_on?: string
          id?: string
          kind?: string
          method?: string | null
          notes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      trf_documents: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string | null
          driver_name: string
          expires_on: string | null
          id: string
          kind: string
          notes: string
          object_path: string | null
          scope: string
          updated_at: string
          updated_by: string | null
          vehicle: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          driver_name?: string
          expires_on?: string | null
          id?: string
          kind: string
          notes?: string
          object_path?: string | null
          scope: string
          updated_at?: string
          updated_by?: string | null
          vehicle?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          driver_name?: string
          expires_on?: string | null
          id?: string
          kind?: string
          notes?: string
          object_path?: string | null
          scope?: string
          updated_at?: string
          updated_by?: string | null
          vehicle?: string
        }
        Relationships: []
      }
      trf_driver_catalog_access: {
        Row: {
          driver_id: string
        }
        Insert: {
          driver_id: string
        }
        Update: {
          driver_id?: string
        }
        Relationships: []
      }
      trf_driver_fuel_receipts: {
        Row: {
          archived: boolean
          distance_meters: number
          driver_id: string
          driver_name: string
          full_tank: boolean | null
          id: string
          liters: number | null
          object_path: string | null
          panel_data: Json | null
          receipt_date: string
          recorded_at: string
          station_id: string
          station_name: string
          total: number | null
          trip_id: string | null
          updated_at: string | null
          updated_by: string | null
          vehicle: string
        }
        Insert: {
          archived?: boolean
          distance_meters?: number
          driver_id: string
          driver_name: string
          full_tank?: boolean | null
          id: string
          liters?: number | null
          object_path?: string | null
          panel_data?: Json | null
          receipt_date?: string
          recorded_at?: string
          station_id?: string
          station_name?: string
          total?: number | null
          trip_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vehicle: string
        }
        Update: {
          archived?: boolean
          distance_meters?: number
          driver_id?: string
          driver_name?: string
          full_tank?: boolean | null
          id?: string
          liters?: number | null
          object_path?: string | null
          panel_data?: Json | null
          receipt_date?: string
          recorded_at?: string
          station_id?: string
          station_name?: string
          total?: number | null
          trip_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vehicle?: string
        }
        Relationships: [
          {
            foreignKeyName: "trf_driver_fuel_receipts_trip_id_driver_id_fkey"
            columns: ["trip_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "trf_driver_tracking_sessions"
            referencedColumns: ["id", "driver_id"]
          },
        ]
      }
      trf_driver_location_history: {
        Row: {
          accuracy_m: number | null
          driver_id: string
          estimated: boolean
          event_id: string | null
          heading: number | null
          id: number
          latitude: number
          longitude: number
          recorded_at: string
          segment: number
          speed_kmh: number | null
          trip_id: string | null
          vehicle: string
        }
        Insert: {
          accuracy_m?: number | null
          driver_id: string
          estimated?: boolean
          event_id?: string | null
          heading?: number | null
          id?: number
          latitude: number
          longitude: number
          recorded_at?: string
          segment?: number
          speed_kmh?: number | null
          trip_id?: string | null
          vehicle: string
        }
        Update: {
          accuracy_m?: number | null
          driver_id?: string
          estimated?: boolean
          event_id?: string | null
          heading?: number | null
          id?: number
          latitude?: number
          longitude?: number
          recorded_at?: string
          segment?: number
          speed_kmh?: number | null
          trip_id?: string | null
          vehicle?: string
        }
        Relationships: [
          {
            foreignKeyName: "trf_driver_location_history_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trf_driver_tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trf_history_owned_trip"
            columns: ["trip_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "trf_driver_tracking_sessions"
            referencedColumns: ["id", "driver_id"]
          },
        ]
      }
      trf_driver_locations: {
        Row: {
          accuracy_m: number | null
          driver_id: string
          driver_name: string
          heading: number | null
          is_tracking: boolean
          latitude: number
          longitude: number
          recorded_at: string
          speed_kmh: number | null
          updated_at: string
          vehicle: string
        }
        Insert: {
          accuracy_m?: number | null
          driver_id: string
          driver_name: string
          heading?: number | null
          is_tracking?: boolean
          latitude: number
          longitude: number
          recorded_at?: string
          speed_kmh?: number | null
          updated_at?: string
          vehicle: string
        }
        Update: {
          accuracy_m?: number | null
          driver_id?: string
          driver_name?: string
          heading?: number | null
          is_tracking?: boolean
          latitude?: number
          longitude?: number
          recorded_at?: string
          speed_kmh?: number | null
          updated_at?: string
          vehicle?: string
        }
        Relationships: []
      }
      trf_driver_payments: {
        Row: {
          amount: number
          concept: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          driver_id: string
          id: string
          method: string
          notes: string
          paid_on: string
          period: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          concept: string
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          driver_id: string
          id?: string
          method: string
          notes?: string
          paid_on: string
          period: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          concept?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          driver_id?: string
          id?: string
          method?: string
          notes?: string
          paid_on?: string
          period?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trf_driver_payments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "trf_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      trf_driver_presence: {
        Row: {
          accuracy_m: number | null
          app_version: string
          driver_id: string
          driver_name: string
          latitude: number | null
          located_at: string | null
          longitude: number | null
          seen_at: string
          vehicle: string | null
        }
        Insert: {
          accuracy_m?: number | null
          app_version: string
          driver_id: string
          driver_name: string
          latitude?: number | null
          located_at?: string | null
          longitude?: number | null
          seen_at?: string
          vehicle?: string | null
        }
        Update: {
          accuracy_m?: number | null
          app_version?: string
          driver_id?: string
          driver_name?: string
          latitude?: number | null
          located_at?: string | null
          longitude?: number | null
          seen_at?: string
          vehicle?: string | null
        }
        Relationships: []
      }
      trf_driver_salaries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          driver_id: string
          id: string
          notes: string
          starts_on: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          driver_id: string
          id?: string
          notes?: string
          starts_on: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          driver_id?: string
          id?: string
          notes?: string
          starts_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trf_driver_salaries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "trf_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      trf_driver_tracking_sessions: {
        Row: {
          active: boolean
          arrival_lat: number | null
          arrival_lng: number | null
          distance_meters: number
          driver_id: string
          driver_name: string
          ended_at: string | null
          id: string
          load_type: string
          origin_lat: number | null
          origin_lng: number | null
          paused: boolean
          started_at: string
          vehicle: string
        }
        Insert: {
          active?: boolean
          arrival_lat?: number | null
          arrival_lng?: number | null
          distance_meters?: number
          driver_id: string
          driver_name: string
          ended_at?: string | null
          id?: string
          load_type?: string
          origin_lat?: number | null
          origin_lng?: number | null
          paused?: boolean
          started_at?: string
          vehicle: string
        }
        Update: {
          active?: boolean
          arrival_lat?: number | null
          arrival_lng?: number | null
          distance_meters?: number
          driver_id?: string
          driver_name?: string
          ended_at?: string | null
          id?: string
          load_type?: string
          origin_lat?: number | null
          origin_lng?: number | null
          paused?: boolean
          started_at?: string
          vehicle?: string
        }
        Relationships: []
      }
      trf_drivers: {
        Row: {
          active: boolean
          bank: string
          bank_account: string
          created_at: string
          created_by: string | null
          document_id: string
          hired_on: string | null
          id: string
          left_on: string | null
          license_category: string
          name: string
          notes: string
          pay_method: string
          phone: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          bank?: string
          bank_account?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          hired_on?: string | null
          id?: string
          left_on?: string | null
          license_category?: string
          name: string
          notes?: string
          pay_method?: string
          phone?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          bank?: string
          bank_account?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          hired_on?: string | null
          id?: string
          left_on?: string | null
          license_category?: string
          name?: string
          notes?: string
          pay_method?: string
          phone?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      trf_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          driver_id: string | null
          file_path: string | null
          id: string
          method: string
          notes: string
          service_id: string | null
          spent_on: string
          supplier: string
          target: string
          target_name: string
          trailer_id: string | null
          trip_key: string | null
          updated_at: string
          updated_by: string | null
          vehicle_key: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          driver_id?: string | null
          file_path?: string | null
          id?: string
          method: string
          notes?: string
          service_id?: string | null
          spent_on: string
          supplier?: string
          target: string
          target_name?: string
          trailer_id?: string | null
          trip_key?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_key?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          driver_id?: string | null
          file_path?: string | null
          id?: string
          method?: string
          notes?: string
          service_id?: string | null
          spent_on?: string
          supplier?: string
          target?: string
          target_name?: string
          trailer_id?: string | null
          trip_key?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trf_expenses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "trf_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trf_expenses_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trf_fleet_units"
            referencedColumns: ["id"]
          },
        ]
      }
      trf_fleet_hitches: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ended_by_leave: string | null
          from_on: string
          id: string
          notes: string
          to_on: string | null
          trailer_id: string
          truck_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ended_by_leave?: string | null
          from_on: string
          id?: string
          notes?: string
          to_on?: string | null
          trailer_id: string
          truck_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ended_by_leave?: string | null
          from_on?: string
          id?: string
          notes?: string
          to_on?: string | null
          trailer_id?: string
          truck_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trf_fleet_hitches_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trf_fleet_units"
            referencedColumns: ["id"]
          },
        ]
      }
      trf_fleet_units: {
        Row: {
          body: string
          brand: string
          capacity: number | null
          capacity_unit: string | null
          catalog_name: string
          chassis: string
          created_at: string
          created_by: string | null
          engine: string
          id: string
          kind: string
          left_on: string | null
          left_reason: string
          model: string
          notes: string
          photo_path: string | null
          plate: string
          updated_at: string
          updated_by: string | null
          vehicle_key: string
          year: number | null
        }
        Insert: {
          body?: string
          brand?: string
          capacity?: number | null
          capacity_unit?: string | null
          catalog_name?: string
          chassis?: string
          created_at?: string
          created_by?: string | null
          engine?: string
          id?: string
          kind: string
          left_on?: string | null
          left_reason?: string
          model?: string
          notes?: string
          photo_path?: string | null
          plate?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_key: string
          year?: number | null
        }
        Update: {
          body?: string
          brand?: string
          capacity?: number | null
          capacity_unit?: string | null
          catalog_name?: string
          chassis?: string
          created_at?: string
          created_by?: string | null
          engine?: string
          id?: string
          kind?: string
          left_on?: string | null
          left_reason?: string
          model?: string
          notes?: string
          photo_path?: string | null
          plate?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_key?: string
          year?: number | null
        }
        Relationships: []
      }
      trf_fuel_station_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          happened_on: string
          id: string
          kind: string
          method: string | null
          notes: string | null
          station_key: string
          station_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          happened_on: string
          id?: string
          kind: string
          method?: string | null
          notes?: string | null
          station_key: string
          station_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          happened_on?: string
          id?: string
          kind?: string
          method?: string | null
          notes?: string | null
          station_key?: string
          station_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      trf_mobile_catalog: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trf_panel_admins: {
        Row: {
          created_at: string
          email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          user_id?: string
        }
        Relationships: []
      }
      trf_panel_trips: {
        Row: {
          amount: number | null
          app_trip_id: string | null
          arrival_at: string | null
          billable_km: number | null
          client: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          departure_at: string | null
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string | null
          driver_id: string | null
          driver_name: string | null
          id: string
          kg: number | null
          notes: string | null
          order_number: string | null
          origin_lat: number | null
          origin_lng: number | null
          origin_name: string | null
          product: string | null
          source: string
          updated_at: string
          updated_by: string | null
          vehicle: string | null
        }
        Insert: {
          amount?: number | null
          app_trip_id?: string | null
          arrival_at?: string | null
          billable_km?: number | null
          client?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          departure_at?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          kg?: number | null
          notes?: string | null
          order_number?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          product?: string | null
          source?: string
          updated_at?: string
          updated_by?: string | null
          vehicle?: string | null
        }
        Update: {
          amount?: number | null
          app_trip_id?: string | null
          arrival_at?: string | null
          billable_km?: number | null
          client?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          departure_at?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          kg?: number | null
          notes?: string | null
          order_number?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          product?: string | null
          source?: string
          updated_at?: string
          updated_by?: string | null
          vehicle?: string | null
        }
        Relationships: []
      }
      trf_profiles: {
        Row: {
          company: string
          email: string
          id: string
          name: string
          phone: string
        }
        Insert: {
          company?: string
          email?: string
          id?: string
          name: string
          phone: string
        }
        Update: {
          company?: string
          email?: string
          id?: string
          name?: string
          phone?: string
        }
        Relationships: []
      }
      trf_rates: {
        Row: {
          bands: Json
          id: string
          km: number
          minimum: number
          pallet: number
          whatsapp: string
        }
        Insert: {
          bands?: Json
          id: string
          km?: number
          minimum?: number
          pallet?: number
          whatsapp?: string
        }
        Update: {
          bands?: Json
          id?: string
          km?: number
          minimum?: number
          pallet?: number
          whatsapp?: string
        }
        Relationships: []
      }
      trf_requests: {
        Row: {
          amount: number | null
          created: string
          data: Json
          estimate: number | null
          id: string
          reply: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created?: string
          data: Json
          estimate?: number | null
          id?: string
          reply?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          amount?: number | null
          created?: string
          data?: Json
          estimate?: number | null
          id?: string
          reply?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trf_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "trf_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trf_route_gaps: {
        Row: {
          created_at: string
          driver_id: string
          from_at: string
          from_lat: number
          from_lng: number
          id: string
          meters: number
          method: string
          segment: number
          straight_meters: number
          to_at: string
          to_lat: number
          to_lng: number
          trip_id: string
          vehicle: string
        }
        Insert: {
          created_at?: string
          driver_id?: string
          from_at: string
          from_lat: number
          from_lng: number
          id: string
          meters: number
          method: string
          segment?: number
          straight_meters: number
          to_at: string
          to_lat: number
          to_lng: number
          trip_id: string
          vehicle: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          from_at?: string
          from_lat?: number
          from_lng?: number
          id?: string
          meters?: number
          method?: string
          segment?: number
          straight_meters?: number
          to_at?: string
          to_lat?: number
          to_lng?: number
          trip_id?: string
          vehicle?: string
        }
        Relationships: [
          {
            foreignKeyName: "trf_route_gaps_owned_trip"
            columns: ["trip_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "trf_driver_tracking_sessions"
            referencedColumns: ["id", "driver_id"]
          },
        ]
      }
      trf_tank_settings: {
        Row: {
          capacity_l: number
          consumption: number
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
          vehicle_key: string
          vehicle_name: string
          warning_l: number
        }
        Insert: {
          capacity_l: number
          consumption: number
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_key: string
          vehicle_name: string
          warning_l: number
        }
        Update: {
          capacity_l?: number
          consumption?: number
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_key?: string
          vehicle_name?: string
          warning_l?: number
        }
        Relationships: []
      }
      trf_trip_details: {
        Row: {
          data: Json
          driver_id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          driver_id: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          driver_id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trf_trip_details_trip_id_driver_id_fkey"
            columns: ["trip_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "trf_driver_tracking_sessions"
            referencedColumns: ["id", "driver_id"]
          },
        ]
      }
      trf_trip_documents: {
        Row: {
          cargo_type: string
          created_at: string
          driver_id: string
          id: string
          kg: number | null
          kind: string
          number: string
          object_path: string | null
          trip_id: string
        }
        Insert: {
          cargo_type?: string
          created_at?: string
          driver_id: string
          id: string
          kg?: number | null
          kind: string
          number?: string
          object_path?: string | null
          trip_id: string
        }
        Update: {
          cargo_type?: string
          created_at?: string
          driver_id?: string
          id?: string
          kg?: number | null
          kind?: string
          number?: string
          object_path?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trf_trip_documents_trip_id_driver_id_fkey"
            columns: ["trip_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "trf_driver_tracking_sessions"
            referencedColumns: ["id", "driver_id"]
          },
        ]
      }
      trf_vehicle_maintenance: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string
          done_on: string | null
          due_km: number | null
          due_on: string | null
          id: string
          interval_km: number | null
          kind: string
          notes: string
          odometer_km: number | null
          updated_at: string
          updated_by: string | null
          vehicle: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          done_on?: string | null
          due_km?: number | null
          due_on?: string | null
          id?: string
          interval_km?: number | null
          kind: string
          notes?: string
          odometer_km?: number | null
          updated_at?: string
          updated_by?: string | null
          vehicle: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          done_on?: string | null
          due_km?: number | null
          due_on?: string | null
          id?: string
          interval_km?: number | null
          kind?: string
          notes?: string
          odometer_km?: number | null
          updated_at?: string
          updated_by?: string | null
          vehicle?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      trf_fleet_hitch: {
        Args: {
          p_from: string
          p_id: string
          p_notes?: string
          p_trailer_current: string | null
          p_trailer_id: string
          p_truck_current: string | null
          p_truck_key: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ended_by_leave: string | null
          from_on: string
          id: string
          notes: string
          to_on: string | null
          trailer_id: string
          truck_key: string
          updated_at: string
          updated_by: string | null
        }
      }
      trf_is_admin: { Args: never; Returns: boolean }
      trf_is_panel_admin: { Args: never; Returns: boolean }
      trf_stop_my_tracking: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
