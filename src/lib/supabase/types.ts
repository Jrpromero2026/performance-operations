/**
 * Database types — GENERATED from the live performance-operations-dev project.
 * Regenerate after every migration:
 *   via Supabase MCP `generate_typescript_types`, or
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 * Hand-written domain aliases live at the bottom of this file; keep them.
 */

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics_dashboard_defaults: {
        Row: {
          created_at: string
          dashboard_id: string
          id: string
          organization_id: string
          profile_id: string | null
          scope: string
          set_by: string
        }
        Insert: {
          created_at?: string
          dashboard_id: string
          id?: string
          organization_id: string
          profile_id?: string | null
          scope: string
          set_by: string
        }
        Update: {
          created_at?: string
          dashboard_id?: string
          id?: string
          organization_id?: string
          profile_id?: string | null
          scope?: string
          set_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_dashboard_defaults_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "analytics_dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboard_defaults_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboard_defaults_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboard_defaults_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_dashboard_sections: {
        Row: {
          created_at: string
          dashboard_id: string
          id: string
          organization_id: string
          position: number
          title: string
        }
        Insert: {
          created_at?: string
          dashboard_id: string
          id?: string
          organization_id: string
          position?: number
          title?: string
        }
        Update: {
          created_at?: string
          dashboard_id?: string
          id?: string
          organization_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_dashboard_sections_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "analytics_dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboard_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_dashboard_widgets: {
        Row: {
          benchmark_id: string | null
          config: Json
          created_at: string
          dashboard_id: string
          goal_id: string | null
          height: number
          id: string
          metric_id: string | null
          organization_id: string
          position: number
          section_id: string | null
          updated_at: string
          widget_type: string
          width: number
        }
        Insert: {
          benchmark_id?: string | null
          config?: Json
          created_at?: string
          dashboard_id: string
          goal_id?: string | null
          height?: number
          id?: string
          metric_id?: string | null
          organization_id: string
          position?: number
          section_id?: string | null
          updated_at?: string
          widget_type: string
          width?: number
        }
        Update: {
          benchmark_id?: string | null
          config?: Json
          created_at?: string
          dashboard_id?: string
          goal_id?: string | null
          height?: number
          id?: string
          metric_id?: string | null
          organization_id?: string
          position?: number
          section_id?: string | null
          updated_at?: string
          widget_type?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_dashboard_widgets_benchmark_id_fkey"
            columns: ["benchmark_id"]
            isOneToOne: false
            referencedRelation: "performance_benchmarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "analytics_dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboard_widgets_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "performance_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboard_widgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboard_widgets_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "analytics_dashboard_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_dashboards: {
        Row: {
          archived_at: string | null
          config: Json
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          owner_id: string
          shared_scope: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          config?: Json
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          owner_id: string
          shared_scope?: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          config?: Json
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          owner_id?: string
          shared_scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_dashboards_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_dashboards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_corrections: {
        Row: {
          appointment_id: string
          change_source: string
          corrected_by: string | null
          created_at: string
          field: string
          id: string
          new_value: string | null
          organization_id: string
          previous_value: string | null
          reason: string
        }
        Insert: {
          appointment_id: string
          change_source?: string
          corrected_by?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          organization_id: string
          previous_value?: string | null
          reason: string
        }
        Update: {
          appointment_id?: string
          change_source?: string
          corrected_by?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          organization_id?: string
          previous_value?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_corrections_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_corrections_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_corrections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_participants: {
        Row: {
          appointment_id: string
          client_id: string
          created_at: string
          id: string
          organization_id: string
          role: string
        }
        Insert: {
          appointment_id: string
          client_id: string
          created_at?: string
          id?: string
          organization_id: string
          role?: string
        }
        Update: {
          appointment_id?: string
          client_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_participants_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_source_links: {
        Row: {
          appointment_id: string
          created_at: string
          external_appointment_id: string | null
          id: string
          import_batch_id: string
          import_row_id: string
          link_type: string
          organization_id: string
          source: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          external_appointment_id?: string | null
          id?: string
          import_batch_id: string
          import_row_id: string
          link_type?: string
          organization_id: string
          source: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          external_appointment_id?: string | null
          id?: string
          import_batch_id?: string
          import_row_id?: string
          link_type?: string
          organization_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_source_links_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_source_links_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_source_links_import_row_id_fkey"
            columns: ["import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_source_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_status_definitions: {
        Row: {
          created_at: string
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      appointment_status_history: {
        Row: {
          appointment_id: string
          change_source: string
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          organization_id: string
          previous_status: string | null
          reason: string | null
        }
        Insert: {
          appointment_id: string
          change_source: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          organization_id: string
          previous_status?: string | null
          reason?: string | null
        }
        Update: {
          appointment_id?: string
          change_source?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          organization_id?: string
          previous_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_status_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_status_history_new_status_fkey"
            columns: ["new_status"]
            isOneToOne: false
            referencedRelation: "appointment_status_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "appointment_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_trainer_assignments: {
        Row: {
          allocation_basis: string | null
          appointment_id: string
          compensated_minutes: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          organization_id: string
          role: string
          source: string
          status: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          allocation_basis?: string | null
          appointment_id: string
          compensated_minutes?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          source?: string
          status?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          allocation_basis?: string | null
          appointment_id?: string
          compensated_minutes?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          source?: string
          status?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_trainer_assignments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_trainer_assignments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_trainer_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_trainer_assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          canonical_status: string
          client_id: string | null
          created_at: string
          currency: string
          department_id: string | null
          duration_minutes: number
          end_at: string
          external_appointment_id: string | null
          id: string
          import_batch_id: string
          import_row_id: string
          notes: string
          organization_id: string
          participant_count: number
          payment_status: string | null
          posted_at: string
          record_state: string
          service_id: string
          source: string
          source_amount_due_cents: number | null
          source_amount_paid_cents: number | null
          source_created_at: string | null
          source_listed_price_cents: number | null
          source_updated_at: string | null
          start_at: string
          timezone: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          appointment_date: string
          canonical_status: string
          client_id?: string | null
          created_at?: string
          currency?: string
          department_id?: string | null
          duration_minutes: number
          end_at: string
          external_appointment_id?: string | null
          id?: string
          import_batch_id: string
          import_row_id: string
          notes?: string
          organization_id: string
          participant_count?: number
          payment_status?: string | null
          posted_at?: string
          record_state?: string
          service_id: string
          source: string
          source_amount_due_cents?: number | null
          source_amount_paid_cents?: number | null
          source_created_at?: string | null
          source_listed_price_cents?: number | null
          source_updated_at?: string | null
          start_at: string
          timezone: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          canonical_status?: string
          client_id?: string | null
          created_at?: string
          currency?: string
          department_id?: string | null
          duration_minutes?: number
          end_at?: string
          external_appointment_id?: string | null
          id?: string
          import_batch_id?: string
          import_row_id?: string
          notes?: string
          organization_id?: string
          participant_count?: number
          payment_status?: string | null
          posted_at?: string
          record_state?: string
          service_id?: string
          source?: string
          source_amount_due_cents?: number | null
          source_amount_paid_cents?: number | null
          source_created_at?: string | null
          source_listed_price_cents?: number | null
          source_updated_at?: string | null
          start_at?: string
          timezone?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_canonical_status_fkey"
            columns: ["canonical_status"]
            isOneToOne: false
            referencedRelation: "appointment_status_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_department_id_organization_id_fkey"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "appointments_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_import_row_id_fkey"
            columns: ["import_row_id"]
            isOneToOne: true
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_organization_id_fkey"
            columns: ["service_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "appointments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      background_job_attempts: {
        Row: {
          attempt_number: number
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          job_id: string
          organization_id: string
          outcome: string | null
          started_at: string
          worker_id: string
        }
        Insert: {
          attempt_number: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_id: string
          organization_id: string
          outcome?: string | null
          started_at?: string
          worker_id: string
        }
        Update: {
          attempt_number?: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string
          organization_id?: string
          outcome?: string | null
          started_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_job_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_job_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          correlation_id: string
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          max_attempts: number
          organization_id: string
          parent_job_id: string | null
          payload: Json
          payload_version: number
          result: Json | null
          scheduled_for: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          job_type: string
          last_error?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          organization_id: string
          parent_job_id?: string | null
          payload?: Json
          payload_version?: number
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          job_type?: string
          last_error?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          organization_id?: string
          parent_job_id?: string | null
          payload?: Json
          payload_version?: number
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_organization_assignments: {
        Row: {
          client_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_organization_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_organization_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_source_identifiers: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          external_id: string
          id: string
          organization_id: string
          source: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          external_id: string
          id?: string
          organization_id: string
          source: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          external_id?: string
          id?: string
          organization_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_source_identifiers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_source_identifiers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_source_identifiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      close_exports: {
        Row: {
          byte_size: number
          created_at: string
          download_count: number
          export_type: string
          file_name: string
          filters: Json
          generated_by: string | null
          id: string
          mime_type: string
          organization_id: string
          payroll_run_id: string | null
          payroll_snapshot_version: number | null
          period_close_run_id: string | null
          report_package_id: string | null
          reporting_period_id: string
          row_count: number
          sha256: string
          superseded: boolean
          version: number
        }
        Insert: {
          byte_size?: number
          created_at?: string
          download_count?: number
          export_type: string
          file_name: string
          filters?: Json
          generated_by?: string | null
          id?: string
          mime_type?: string
          organization_id: string
          payroll_run_id?: string | null
          payroll_snapshot_version?: number | null
          period_close_run_id?: string | null
          report_package_id?: string | null
          reporting_period_id: string
          row_count?: number
          sha256: string
          superseded?: boolean
          version?: number
        }
        Update: {
          byte_size?: number
          created_at?: string
          download_count?: number
          export_type?: string
          file_name?: string
          filters?: Json
          generated_by?: string | null
          id?: string
          mime_type?: string
          organization_id?: string
          payroll_run_id?: string | null
          payroll_snapshot_version?: number | null
          period_close_run_id?: string | null
          report_package_id?: string | null
          reporting_period_id?: string
          row_count?: number
          sha256?: string
          superseded?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "close_exports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_exports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_exports_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_exports_period_close_run_id_fkey"
            columns: ["period_close_run_id"]
            isOneToOne: false
            referencedRelation: "period_close_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_exports_report_package_id_fkey"
            columns: ["report_package_id"]
            isOneToOne: false
            referencedRelation: "report_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_exports_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_tiers: {
        Row: {
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          max_revenue_cents: number | null
          min_revenue_cents: number
          organization_id: string
          plan_version_id: string
          rate_basis_points: number
          sequence: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          max_revenue_cents?: number | null
          min_revenue_cents: number
          organization_id: string
          plan_version_id: string
          rate_basis_points: number
          sequence: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          max_revenue_cents?: number | null
          min_revenue_cents?: number
          organization_id?: string
          plan_version_id?: string
          rate_basis_points?: number
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_tiers_plan_version_id_organization_id_fkey"
            columns: ["plan_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "compensation_plan_versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      compensation_plan_versions: {
        Row: {
          compensation_method: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          notes: string
          organization_id: string
          plan_id: string
          rounding_scope: string | null
          status: string
          tier_behavior: string
          updated_at: string
          version_number: number
        }
        Insert: {
          compensation_method: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string
          organization_id: string
          plan_id: string
          rounding_scope?: string | null
          status?: string
          tier_behavior?: string
          updated_at?: string
          version_number: number
        }
        Update: {
          compensation_method?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string
          organization_id?: string
          plan_id?: string
          rounding_scope?: string | null
          status?: string
          tier_behavior?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "compensation_plan_versions_plan_id_organization_id_fkey"
            columns: ["plan_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "compensation_plans"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      compensation_plans: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          notes: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          notes?: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          notes?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_rules: {
        Row: {
          amount_cents: number | null
          basis_type: string | null
          created_at: string
          criteria: Json
          id: string
          notes: string
          organization_id: string
          plan_version_id: string
          rate_basis_points: number | null
          rule_type: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          basis_type?: string | null
          created_at?: string
          criteria?: Json
          id?: string
          notes?: string
          organization_id: string
          plan_version_id: string
          rate_basis_points?: number | null
          rule_type: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          basis_type?: string | null
          created_at?: string
          criteria?: Json
          id?: string
          notes?: string
          organization_id?: string
          plan_version_id?: string
          rate_basis_points?: number | null
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_rules_plan_version_id_organization_id_fkey"
            columns: ["plan_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "compensation_plan_versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      delivery_channels: {
        Row: {
          allow_external_recipients: boolean
          allow_trainer_statements: boolean
          channel_type: string
          config: Json
          created_at: string
          id: string
          organization_id: string
          provider: string
          secret_ref: string | null
          sender_address: string | null
          sender_name: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_external_recipients?: boolean
          allow_trainer_statements?: boolean
          channel_type?: string
          config?: Json
          created_at?: string
          id?: string
          organization_id: string
          provider?: string
          secret_ref?: string | null
          sender_address?: string | null
          sender_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_external_recipients?: boolean
          allow_trainer_statements?: boolean
          channel_type?: string
          config?: Json
          created_at?: string
          id?: string
          organization_id?: string
          provider?: string
          secret_ref?: string | null
          sender_address?: string | null
          sender_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_channels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      department_memberships: {
        Row: {
          created_at: string
          department_id: string
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_memberships_department_id_organization_id_fkey"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "department_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          artifact_id: string | null
          artifact_sha256: string | null
          artifact_type: string | null
          attempt_count: number
          channel_id: string | null
          created_at: string
          finalized_at: string | null
          id: string
          idempotency_key: string
          job_id: string | null
          last_error: string | null
          organization_id: string
          provider: string
          provider_message_id: string | null
          recipient_email: string
          recipient_profile_id: string | null
          recipient_type: string
          scheduled_report_run_id: string | null
          sent_at: string | null
          status: string
          subject: string
          template_key: string
        }
        Insert: {
          artifact_id?: string | null
          artifact_sha256?: string | null
          artifact_type?: string | null
          attempt_count?: number
          channel_id?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          idempotency_key: string
          job_id?: string | null
          last_error?: string | null
          organization_id: string
          provider?: string
          provider_message_id?: string | null
          recipient_email: string
          recipient_profile_id?: string | null
          recipient_type?: string
          scheduled_report_run_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_key: string
        }
        Update: {
          artifact_id?: string | null
          artifact_sha256?: string | null
          artifact_type?: string | null
          attempt_count?: number
          channel_id?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          idempotency_key?: string
          job_id?: string | null
          last_error?: string | null
          organization_id?: string
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string
          recipient_profile_id?: string | null
          recipient_type?: string
          scheduled_report_run_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "delivery_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_events_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_events_scheduled_report_run_id_fkey"
            columns: ["scheduled_report_run_id"]
            isOneToOne: false
            referencedRelation: "scheduled_report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      export_events: {
        Row: {
          created_at: string
          engine_version: string | null
          export_type: string
          format: string
          generated_by: string | null
          id: string
          metadata: Json
          organization_id: string
          source_page: string
        }
        Insert: {
          created_at?: string
          engine_version?: string | null
          export_type: string
          format?: string
          generated_by?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          source_page: string
        }
        Update: {
          created_at?: string
          engine_version?: string | null
          export_type?: string
          format?: string
          generated_by?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          source_page?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_events_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          import_batch_id: string
          organization_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          import_batch_id: string
          organization_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          import_batch_id?: string
          organization_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_events_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          accepted_row_count: number
          adapter_version: string
          approved_at: string | null
          approved_by: string | null
          blocked_row_count: number
          created_at: string
          created_via: string
          duplicate_row_count: number
          excluded_row_count: number
          failure_code: string | null
          file_hash: string
          file_size: number
          id: string
          integration_connection_id: string | null
          integration_sync_run_id: string | null
          metadata: Json
          mime_type: string
          organization_id: string
          original_filename: string
          parsing_completed_at: string | null
          parsing_started_at: string | null
          posted_at: string | null
          posted_by: string | null
          posted_row_count: number
          reversed_at: string | null
          reversed_by: string | null
          sanitized_failure_message: string | null
          schema_profile_id: string | null
          source: string
          source_account_identifier: string | null
          status: string
          storage_path: string
          total_row_count: number
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          warning_row_count: number
        }
        Insert: {
          accepted_row_count?: number
          adapter_version?: string
          approved_at?: string | null
          approved_by?: string | null
          blocked_row_count?: number
          created_at?: string
          created_via?: string
          duplicate_row_count?: number
          excluded_row_count?: number
          failure_code?: string | null
          file_hash: string
          file_size: number
          id?: string
          integration_connection_id?: string | null
          integration_sync_run_id?: string | null
          metadata?: Json
          mime_type: string
          organization_id: string
          original_filename: string
          parsing_completed_at?: string | null
          parsing_started_at?: string | null
          posted_at?: string | null
          posted_by?: string | null
          posted_row_count?: number
          reversed_at?: string | null
          reversed_by?: string | null
          sanitized_failure_message?: string | null
          schema_profile_id?: string | null
          source: string
          source_account_identifier?: string | null
          status?: string
          storage_path: string
          total_row_count?: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          warning_row_count?: number
        }
        Update: {
          accepted_row_count?: number
          adapter_version?: string
          approved_at?: string | null
          approved_by?: string | null
          blocked_row_count?: number
          created_at?: string
          created_via?: string
          duplicate_row_count?: number
          excluded_row_count?: number
          failure_code?: string | null
          file_hash?: string
          file_size?: number
          id?: string
          integration_connection_id?: string | null
          integration_sync_run_id?: string | null
          metadata?: Json
          mime_type?: string
          organization_id?: string
          original_filename?: string
          parsing_completed_at?: string | null
          parsing_started_at?: string | null
          posted_at?: string | null
          posted_by?: string | null
          posted_row_count?: number
          reversed_at?: string | null
          reversed_by?: string | null
          sanitized_failure_message?: string | null
          schema_profile_id?: string | null
          source?: string
          source_account_identifier?: string | null
          status?: string
          storage_path?: string
          total_row_count?: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          warning_row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_integration_connection_id_fkey"
            columns: ["integration_connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_integration_sync_run_id_fkey"
            columns: ["integration_sync_run_id"]
            isOneToOne: false
            referencedRelation: "integration_sync_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_schema_profile_fkey"
            columns: ["schema_profile_id"]
            isOneToOne: false
            referencedRelation: "import_schema_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_resolutions: {
        Row: {
          action: string
          actor_id: string | null
          affected_row_count: number
          created_at: string
          id: string
          import_batch_id: string
          import_row_id: string | null
          organization_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          affected_row_count?: number
          created_at?: string
          id?: string
          import_batch_id: string
          import_row_id?: string | null
          organization_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          affected_row_count?: number
          created_at?: string
          id?: string
          import_batch_id?: string
          import_row_id?: string | null
          organization_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_resolutions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_resolutions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_resolutions_import_row_id_fkey"
            columns: ["import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_resolutions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_row_issues: {
        Row: {
          code: string
          created_at: string
          field: string | null
          id: string
          import_batch_id: string
          import_row_id: string
          message: string
          organization_id: string
          original_value: string | null
          resolution_note: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          suggested_action: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          field?: string | null
          id?: string
          import_batch_id: string
          import_row_id: string
          message: string
          organization_id: string
          original_value?: string | null
          resolution_note?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          suggested_action?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          field?: string | null
          id?: string
          import_batch_id?: string
          import_row_id?: string
          message?: string
          organization_id?: string
          original_value?: string | null
          resolution_note?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          suggested_action?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_row_issues_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_issues_import_row_id_fkey"
            columns: ["import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          amount_paid_cents: number | null
          appointment_date: string | null
          blocking_issue_count: number
          canonical_status: string | null
          client_match_method: string | null
          corrections: Json
          created_at: string
          currency: string
          duplicate_class: string | null
          duration_minutes: number | null
          end_at: string | null
          excluded_by: string | null
          exclusion_reason: string | null
          external_appointment_id: string | null
          id: string
          import_batch_id: string
          info_count: number
          listed_price_cents: number | null
          matched_client_id: string | null
          matched_service_id: string | null
          matched_trainer_id: string | null
          normalized_row: Json
          organization_id: string
          original_row: Json
          posted_appointment_id: string | null
          processing_status: string
          proposed_department_id: string | null
          row_hash: string
          service_match_method: string | null
          source_row_number: number
          start_at: string | null
          trainer_match_method: string | null
          updated_at: string
          warning_count: number
        }
        Insert: {
          amount_paid_cents?: number | null
          appointment_date?: string | null
          blocking_issue_count?: number
          canonical_status?: string | null
          client_match_method?: string | null
          corrections?: Json
          created_at?: string
          currency?: string
          duplicate_class?: string | null
          duration_minutes?: number | null
          end_at?: string | null
          excluded_by?: string | null
          exclusion_reason?: string | null
          external_appointment_id?: string | null
          id?: string
          import_batch_id: string
          info_count?: number
          listed_price_cents?: number | null
          matched_client_id?: string | null
          matched_service_id?: string | null
          matched_trainer_id?: string | null
          normalized_row?: Json
          organization_id: string
          original_row: Json
          posted_appointment_id?: string | null
          processing_status?: string
          proposed_department_id?: string | null
          row_hash: string
          service_match_method?: string | null
          source_row_number: number
          start_at?: string | null
          trainer_match_method?: string | null
          updated_at?: string
          warning_count?: number
        }
        Update: {
          amount_paid_cents?: number | null
          appointment_date?: string | null
          blocking_issue_count?: number
          canonical_status?: string | null
          client_match_method?: string | null
          corrections?: Json
          created_at?: string
          currency?: string
          duplicate_class?: string | null
          duration_minutes?: number | null
          end_at?: string | null
          excluded_by?: string | null
          exclusion_reason?: string | null
          external_appointment_id?: string | null
          id?: string
          import_batch_id?: string
          info_count?: number
          listed_price_cents?: number | null
          matched_client_id?: string | null
          matched_service_id?: string | null
          matched_trainer_id?: string | null
          normalized_row?: Json
          organization_id?: string
          original_row?: Json
          posted_appointment_id?: string | null
          processing_status?: string
          proposed_department_id?: string | null
          row_hash?: string
          service_match_method?: string | null
          source_row_number?: number
          start_at?: string | null
          trainer_match_method?: string | null
          updated_at?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_canonical_status_fkey"
            columns: ["canonical_status"]
            isOneToOne: false
            referencedRelation: "appointment_status_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "import_rows_excluded_by_fkey"
            columns: ["excluded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_matched_service_id_fkey"
            columns: ["matched_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_matched_trainer_id_fkey"
            columns: ["matched_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_proposed_department_id_fkey"
            columns: ["proposed_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      import_schema_profiles: {
        Row: {
          column_mappings: Json
          created_at: string
          created_by: string | null
          header_signature: string
          id: string
          name: string
          organization_id: string
          source: string
          version: number
        }
        Insert: {
          column_mappings: Json
          created_at?: string
          created_by?: string | null
          header_signature: string
          id?: string
          name: string
          organization_id: string
          source: string
          version?: number
        }
        Update: {
          column_mappings?: Json
          created_at?: string
          created_by?: string | null
          header_signature?: string
          id?: string
          name?: string
          organization_id?: string
          source?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_schema_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_schema_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          capabilities: Json
          created_at: string
          created_by: string | null
          failure_reason: string | null
          id: string
          last_health_check_at: string | null
          last_health_status: string | null
          name: string
          organization_id: string
          provider_key: string
          secret_fingerprint: string | null
          secret_ref: string | null
          secret_rotated_at: string | null
          secret_version: number
          status: string
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          id?: string
          last_health_check_at?: string | null
          last_health_status?: string | null
          name: string
          organization_id: string
          provider_key: string
          secret_fingerprint?: string | null
          secret_ref?: string | null
          secret_rotated_at?: string | null
          secret_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          id?: string
          last_health_check_at?: string | null
          last_health_status?: string | null
          name?: string
          organization_id?: string
          provider_key?: string
          secret_fingerprint?: string | null
          secret_ref?: string | null
          secret_rotated_at?: string | null
          secret_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_connections_provider_key_fkey"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["key"]
          },
        ]
      }
      integration_cursors: {
        Row: {
          advanced_at: string | null
          connection_id: string
          cursor_value: string | null
          data_type: string
          definition_id: string
          id: string
          organization_id: string
          previous_value: string | null
          reset_by: string | null
          reset_reason: string | null
          updated_at: string
        }
        Insert: {
          advanced_at?: string | null
          connection_id: string
          cursor_value?: string | null
          data_type: string
          definition_id: string
          id?: string
          organization_id: string
          previous_value?: string | null
          reset_by?: string | null
          reset_reason?: string | null
          updated_at?: string
        }
        Update: {
          advanced_at?: string | null
          connection_id?: string
          cursor_value?: string | null
          data_type?: string
          definition_id?: string
          id?: string
          organization_id?: string
          previous_value?: string | null
          reset_by?: string | null
          reset_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_cursors_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_cursors_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "integration_sync_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_cursors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_cursors_reset_by_fkey"
            columns: ["reset_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_failures: {
        Row: {
          attempt_count: number
          connection_id: string | null
          correlation_id: string | null
          failure_code: string
          first_seen_at: string
          id: string
          job_id: string | null
          last_seen_at: string
          message: string
          organization_id: string
          provider_key: string
          recommended_action: string
          resolved: boolean
          resolved_at: string | null
          retryable: boolean
        }
        Insert: {
          attempt_count?: number
          connection_id?: string | null
          correlation_id?: string | null
          failure_code: string
          first_seen_at?: string
          id?: string
          job_id?: string | null
          last_seen_at?: string
          message?: string
          organization_id: string
          provider_key: string
          recommended_action?: string
          resolved?: boolean
          resolved_at?: string | null
          retryable?: boolean
        }
        Update: {
          attempt_count?: number
          connection_id?: string | null
          correlation_id?: string | null
          failure_code?: string
          first_seen_at?: string
          id?: string
          job_id?: string | null
          last_seen_at?: string
          message?: string
          organization_id?: string
          provider_key?: string
          recommended_action?: string
          resolved?: boolean
          resolved_at?: string | null
          retryable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "integration_failures_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_failures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_providers: {
        Row: {
          adapter_version: string | null
          blocked_reasons: Json
          capabilities: Json
          created_at: string
          display_name: string
          docs_inspected_on: string | null
          docs_url: string | null
          key: string
          status: string
          updated_at: string
        }
        Insert: {
          adapter_version?: string | null
          blocked_reasons?: Json
          capabilities?: Json
          created_at?: string
          display_name: string
          docs_inspected_on?: string | null
          docs_url?: string | null
          key: string
          status?: string
          updated_at?: string
        }
        Update: {
          adapter_version?: string | null
          blocked_reasons?: Json
          capabilities?: Json
          created_at?: string
          display_name?: string
          docs_inspected_on?: string | null
          docs_url?: string | null
          key?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_source_records: {
        Row: {
          connection_id: string
          data_type: string
          external_id: string
          id: string
          organization_id: string
          payload: Json
          payload_sha256: string
          received_at: string
          source_updated_at: string | null
          sync_run_id: string | null
        }
        Insert: {
          connection_id: string
          data_type: string
          external_id: string
          id?: string
          organization_id: string
          payload: Json
          payload_sha256: string
          received_at?: string
          source_updated_at?: string | null
          sync_run_id?: string | null
        }
        Update: {
          connection_id?: string
          data_type?: string
          external_id?: string
          id?: string
          organization_id?: string
          payload?: Json
          payload_sha256?: string
          received_at?: string
          source_updated_at?: string | null
          sync_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_source_records_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_source_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_source_records_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "integration_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_definitions: {
        Row: {
          active: boolean
          auto_approve: boolean
          auto_create_batch: boolean
          auto_parse: boolean
          auto_post: boolean
          auto_validate: boolean
          connection_id: string
          created_at: string
          data_type: string
          department_id: string | null
          frequency: string
          id: string
          last_successful_run_at: string | null
          mode: string
          next_intended_run_at: string | null
          organization_id: string
          owner_id: string | null
          timezone: string
          updated_at: string
          window_days: number
          window_end: string | null
          window_start: string | null
          window_strategy: string
        }
        Insert: {
          active?: boolean
          auto_approve?: boolean
          auto_create_batch?: boolean
          auto_parse?: boolean
          auto_post?: boolean
          auto_validate?: boolean
          connection_id: string
          created_at?: string
          data_type?: string
          department_id?: string | null
          frequency?: string
          id?: string
          last_successful_run_at?: string | null
          mode?: string
          next_intended_run_at?: string | null
          organization_id: string
          owner_id?: string | null
          timezone?: string
          updated_at?: string
          window_days?: number
          window_end?: string | null
          window_start?: string | null
          window_strategy?: string
        }
        Update: {
          active?: boolean
          auto_approve?: boolean
          auto_create_batch?: boolean
          auto_parse?: boolean
          auto_post?: boolean
          auto_validate?: boolean
          connection_id?: string
          created_at?: string
          data_type?: string
          department_id?: string | null
          frequency?: string
          id?: string
          last_successful_run_at?: string | null
          mode?: string
          next_intended_run_at?: string | null
          organization_id?: string
          owner_id?: string | null
          timezone?: string
          updated_at?: string
          window_days?: number
          window_end?: string | null
          window_start?: string | null
          window_strategy?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_definitions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_definitions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_definitions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_runs: {
        Row: {
          completed_at: string | null
          connection_id: string
          correlation_id: string
          created_at: string
          cursor_after: string | null
          cursor_before: string | null
          definition_id: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          import_batch_id: string | null
          job_id: string | null
          organization_id: string
          pages_fetched: number
          rate_limit_state: Json
          records_accepted: number
          records_fetched: number
          records_rejected: number
          records_unchanged: number
          requested_window: Json
          retry_count: number
          started_at: string
          status: string
          trigger_source: string
          warnings: Json
        }
        Insert: {
          completed_at?: string | null
          connection_id: string
          correlation_id?: string
          created_at?: string
          cursor_after?: string | null
          cursor_before?: string | null
          definition_id?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          import_batch_id?: string | null
          job_id?: string | null
          organization_id: string
          pages_fetched?: number
          rate_limit_state?: Json
          records_accepted?: number
          records_fetched?: number
          records_rejected?: number
          records_unchanged?: number
          requested_window?: Json
          retry_count?: number
          started_at?: string
          status?: string
          trigger_source?: string
          warnings?: Json
        }
        Update: {
          completed_at?: string | null
          connection_id?: string
          correlation_id?: string
          created_at?: string
          cursor_after?: string | null
          cursor_before?: string | null
          definition_id?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          import_batch_id?: string | null
          job_id?: string | null
          organization_id?: string
          pages_fetched?: number
          rate_limit_state?: Json
          records_accepted?: number
          records_fetched?: number
          records_rejected?: number
          records_unchanged?: number
          requested_window?: Json
          retry_count?: number
          started_at?: string
          status?: string
          trigger_source?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_runs_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "integration_sync_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_runs_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhook_endpoints: {
        Row: {
          active: boolean
          connection_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          provider_key: string
          secret_ref: string | null
          token_sha256: string
        }
        Insert: {
          active?: boolean
          connection_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          provider_key: string
          secret_ref?: string | null
          token_sha256: string
        }
        Update: {
          active?: boolean
          connection_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          provider_key?: string
          secret_ref?: string | null
          token_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhook_endpoints_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhook_endpoints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhook_endpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhook_endpoints_provider_key_fkey"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["key"]
          },
        ]
      }
      integration_webhook_events: {
        Row: {
          connection_id: string
          endpoint_id: string
          event_type: string
          id: string
          job_id: string | null
          organization_id: string
          payload: Json
          payload_sha256: string
          provider_event_id: string
          received_at: string
          rejection_reason: string | null
          status: string
        }
        Insert: {
          connection_id: string
          endpoint_id: string
          event_type: string
          id?: string
          job_id?: string | null
          organization_id: string
          payload?: Json
          payload_sha256: string
          provider_event_id: string
          received_at?: string
          rejection_reason?: string | null
          status?: string
        }
        Update: {
          connection_id?: string
          endpoint_id?: string
          event_type?: string
          id?: string
          job_id?: string | null
          organization_id?: string
          payload?: Json
          payload_sha256?: string
          provider_event_id?: string
          received_at?: string
          rejection_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhook_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhook_events_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "integration_webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_profile_id: string | null
          created_at: string
          department_ids: string[]
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role_id: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_profile_id?: string | null
          created_at?: string
          department_ids?: string[]
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role_id: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_profile_id?: string | null
          created_at?: string
          department_ids?: string[]
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_profile_id_fkey"
            columns: ["accepted_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_minutes: number | null
          compensation_purpose: string
          created_at: string
          description: string
          id: string
          organization_id: string
          payroll_run_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          reporting_period_id: string
          requested_minutes: number
          status: string
          submitted_at: string | null
          submitted_by: string | null
          trainer_id: string
          updated_at: string
          work_category: string
          work_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_minutes?: number | null
          compensation_purpose?: string
          created_at?: string
          description: string
          id?: string
          organization_id: string
          payroll_run_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reporting_period_id: string
          requested_minutes: number
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          trainer_id: string
          updated_at?: string
          work_category: string
          work_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_minutes?: number | null
          compensation_purpose?: string
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          payroll_run_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reporting_period_id?: string
          requested_minutes?: number
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          trainer_id?: string
          updated_at?: string
          work_category?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_time_entries_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_time_entries_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_time_entries_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_time_entries_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_time_entries_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          archived_at: string | null
          body: string
          category: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link_path: string | null
          organization_id: string | null
          pinned_at: string | null
          read_at: string | null
          recipient_id: string
          severity: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          archived_at?: string | null
          body?: string
          category: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link_path?: string | null
          organization_id?: string | null
          pinned_at?: string | null
          read_at?: string | null
          recipient_id: string
          severity?: string
          title: string
        }
        Update: {
          actor_id?: string | null
          archived_at?: string | null
          body?: string
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link_path?: string | null
          organization_id?: string | null
          pinned_at?: string | null
          read_at?: string | null
          recipient_id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_close_policies: {
        Row: {
          allow_self_approval: boolean
          created_at: string
          organization_id: string
          payroll_required_state: string
          require_ack_note: boolean
          updated_at: string
        }
        Insert: {
          allow_self_approval?: boolean
          created_at?: string
          organization_id: string
          payroll_required_state?: string
          require_ack_note?: boolean
          updated_at?: string
        }
        Update: {
          allow_self_approval?: boolean
          created_at?: string
          organization_id?: string
          payroll_required_state?: string
          require_ack_note?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_close_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          is_default: boolean
          organization_id: string
          profile_id: string
          role_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_default?: boolean
          organization_id: string
          profile_id: string
          role_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_default?: boolean
          organization_id?: string
          profile_id?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_adjustments: {
        Row: {
          adjustment_type: string
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          organization_id: string
          payroll_run_id: string | null
          reason: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          reporting_period_id: string
          requested_at: string | null
          requested_by: string | null
          status: string
          supersedes_adjustment_id: string | null
          supporting_reference: string | null
          trainer_id: string
          updated_at: string
        }
        Insert: {
          adjustment_type: string
          amount_cents: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          organization_id: string
          payroll_run_id?: string | null
          reason: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reporting_period_id: string
          requested_at?: string | null
          requested_by?: string | null
          status?: string
          supersedes_adjustment_id?: string | null
          supporting_reference?: string | null
          trainer_id: string
          updated_at?: string
        }
        Update: {
          adjustment_type?: string
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          payroll_run_id?: string | null
          reason?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reporting_period_id?: string
          requested_at?: string | null
          requested_by?: string | null
          status?: string
          supersedes_adjustment_id?: string | null
          supporting_reference?: string | null
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_supersedes_adjustment_id_fkey"
            columns: ["supersedes_adjustment_id"]
            isOneToOne: false
            referencedRelation: "payroll_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_calculation_lines: {
        Row: {
          appointment_id: string | null
          appointment_trainer_assignment_id: string | null
          basis_amount_cents: number | null
          calculated_amount_cents: number
          calculation_formula_version: string
          calculation_status: string
          calculation_trace: Json
          compensation_plan_version_id: string | null
          compensation_rule_id: string | null
          created_at: string
          eligibility_result: string
          exclusion_reason: string | null
          id: string
          input_quantity: number | null
          input_unit: string | null
          line_type: string
          manual_time_entry_id: string | null
          organization_id: string
          payroll_adjustment_id: string | null
          payroll_run_id: string
          rate_amount_cents: number | null
          rate_basis_points: number | null
          rounded_amount_cents: number
          rounding_method: string
          trainer_id: string
          trainer_summary_id: string
        }
        Insert: {
          appointment_id?: string | null
          appointment_trainer_assignment_id?: string | null
          basis_amount_cents?: number | null
          calculated_amount_cents?: number
          calculation_formula_version?: string
          calculation_status?: string
          calculation_trace?: Json
          compensation_plan_version_id?: string | null
          compensation_rule_id?: string | null
          created_at?: string
          eligibility_result?: string
          exclusion_reason?: string | null
          id?: string
          input_quantity?: number | null
          input_unit?: string | null
          line_type: string
          manual_time_entry_id?: string | null
          organization_id: string
          payroll_adjustment_id?: string | null
          payroll_run_id: string
          rate_amount_cents?: number | null
          rate_basis_points?: number | null
          rounded_amount_cents?: number
          rounding_method?: string
          trainer_id: string
          trainer_summary_id: string
        }
        Update: {
          appointment_id?: string | null
          appointment_trainer_assignment_id?: string | null
          basis_amount_cents?: number | null
          calculated_amount_cents?: number
          calculation_formula_version?: string
          calculation_status?: string
          calculation_trace?: Json
          compensation_plan_version_id?: string | null
          compensation_rule_id?: string | null
          created_at?: string
          eligibility_result?: string
          exclusion_reason?: string | null
          id?: string
          input_quantity?: number | null
          input_unit?: string | null
          line_type?: string
          manual_time_entry_id?: string | null
          organization_id?: string
          payroll_adjustment_id?: string | null
          payroll_run_id?: string
          rate_amount_cents?: number | null
          rate_basis_points?: number | null
          rounded_amount_cents?: number
          rounding_method?: string
          trainer_id?: string
          trainer_summary_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_calculation_lines_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_calculation_lines_appointment_trainer_assignment_i_fkey"
            columns: ["appointment_trainer_assignment_id"]
            isOneToOne: false
            referencedRelation: "appointment_trainer_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_calculation_lines_compensation_plan_version_id_fkey"
            columns: ["compensation_plan_version_id"]
            isOneToOne: false
            referencedRelation: "compensation_plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_calculation_lines_compensation_rule_id_fkey"
            columns: ["compensation_rule_id"]
            isOneToOne: false
            referencedRelation: "compensation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_calculation_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_calculation_lines_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_calculation_lines_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_calculation_lines_trainer_summary_id_fkey"
            columns: ["trainer_summary_id"]
            isOneToOne: false
            referencedRelation: "payroll_trainer_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_adjustment_fkey"
            columns: ["payroll_adjustment_id"]
            isOneToOne: false
            referencedRelation: "payroll_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_time_entry_fkey"
            columns: ["manual_time_entry_id"]
            isOneToOne: false
            referencedRelation: "manual_time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_exports: {
        Row: {
          created_at: string
          export_type: string
          generated_by: string | null
          id: string
          organization_id: string
          payroll_run_id: string
          snapshot_version: number | null
          superseded: boolean
          trainer_id: string | null
        }
        Insert: {
          created_at?: string
          export_type: string
          generated_by?: string | null
          id?: string
          organization_id: string
          payroll_run_id: string
          snapshot_version?: number | null
          superseded?: boolean
          trainer_id?: string | null
        }
        Update: {
          created_at?: string
          export_type?: string
          generated_by?: string | null
          id?: string
          organization_id?: string
          payroll_run_id?: string
          snapshot_version?: number | null
          superseded?: boolean
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_exports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_exports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_exports_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_exports_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_issues: {
        Row: {
          appointment_id: string | null
          code: string
          compensation_rule_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          organization_id: string
          payroll_run_id: string
          resolution_reason: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          suggested_action: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          code: string
          compensation_rule_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          organization_id: string
          payroll_run_id: string
          resolution_reason?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          suggested_action?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          code?: string
          compensation_rule_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          organization_id?: string
          payroll_run_id?: string
          resolution_reason?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          suggested_action?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_issues_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_issues_compensation_rule_id_fkey"
            columns: ["compensation_rule_id"]
            isOneToOne: false
            referencedRelation: "compensation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_issues_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_issues_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_run_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          organization_id: string
          payroll_run_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          organization_id: string
          payroll_run_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          organization_id?: string
          payroll_run_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_run_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_events_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          adjustment_total_cents: number
          appointment_count: number
          approved_at: string | null
          approved_by: string | null
          blocking_issue_count: number
          calculation_completed_at: string | null
          calculation_started_at: string | null
          calculation_version: string
          created_at: string
          created_by: string | null
          failure_code: string | null
          final_compensation_total_cents: number
          gross_compensation_total_cents: number
          id: string
          locked_at: string | null
          locked_by: string | null
          metadata: Json
          name: string
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          reporting_period_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          run_number: number
          sanitized_failure_message: string | null
          source_appointment_cutoff_at: string | null
          status: string
          superseded_by_payroll_run_id: string | null
          supersedes_payroll_run_id: string | null
          trainer_count: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          warning_count: number
        }
        Insert: {
          adjustment_total_cents?: number
          appointment_count?: number
          approved_at?: string | null
          approved_by?: string | null
          blocking_issue_count?: number
          calculation_completed_at?: string | null
          calculation_started_at?: string | null
          calculation_version?: string
          created_at?: string
          created_by?: string | null
          failure_code?: string | null
          final_compensation_total_cents?: number
          gross_compensation_total_cents?: number
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          name: string
          organization_id: string
          posted_at?: string | null
          posted_by?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          reporting_period_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_number?: number
          sanitized_failure_message?: string | null
          source_appointment_cutoff_at?: string | null
          status?: string
          superseded_by_payroll_run_id?: string | null
          supersedes_payroll_run_id?: string | null
          trainer_count?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warning_count?: number
        }
        Update: {
          adjustment_total_cents?: number
          appointment_count?: number
          approved_at?: string | null
          approved_by?: string | null
          blocking_issue_count?: number
          calculation_completed_at?: string | null
          calculation_started_at?: string | null
          calculation_version?: string
          created_at?: string
          created_by?: string | null
          failure_code?: string | null
          final_compensation_total_cents?: number
          gross_compensation_total_cents?: number
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          reporting_period_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_number?: number
          sanitized_failure_message?: string | null
          source_appointment_cutoff_at?: string | null
          status?: string
          superseded_by_payroll_run_id?: string | null
          supersedes_payroll_run_id?: string | null
          trainer_count?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_superseded_by_payroll_run_id_fkey"
            columns: ["superseded_by_payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_supersedes_payroll_run_id_fkey"
            columns: ["supersedes_payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          lines_sha256: string
          organization_id: string
          payload: Json
          payroll_run_id: string
          snapshot_version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          lines_sha256: string
          organization_id: string
          payload: Json
          payroll_run_id: string
          snapshot_version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          lines_sha256?: string
          organization_id?: string
          payload?: Json
          payroll_run_id?: string
          snapshot_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_snapshots_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_trainer_summaries: {
        Row: {
          adjustment_total_cents: number
          appointment_count: number
          blocking_issue_count: number
          bonus_total_cents: number
          calculation_status: string
          commission_compensation_cents: number
          compensated_minutes: number
          compensation_assignment_id: string | null
          compensation_plan_version_id: string | null
          completed_session_count: number
          created_at: string
          deduction_total_cents: number
          eligible_basis_total_cents: number
          final_gross_compensation_cents: number
          flat_rate_compensation_cents: number
          hourly_compensation_cents: number
          id: string
          notes: string
          organization_id: string
          payroll_run_id: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          team_compensation_cents: number
          trainer_id: string
          updated_at: string
          warning_count: number
        }
        Insert: {
          adjustment_total_cents?: number
          appointment_count?: number
          blocking_issue_count?: number
          bonus_total_cents?: number
          calculation_status?: string
          commission_compensation_cents?: number
          compensated_minutes?: number
          compensation_assignment_id?: string | null
          compensation_plan_version_id?: string | null
          completed_session_count?: number
          created_at?: string
          deduction_total_cents?: number
          eligible_basis_total_cents?: number
          final_gross_compensation_cents?: number
          flat_rate_compensation_cents?: number
          hourly_compensation_cents?: number
          id?: string
          notes?: string
          organization_id: string
          payroll_run_id: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          team_compensation_cents?: number
          trainer_id: string
          updated_at?: string
          warning_count?: number
        }
        Update: {
          adjustment_total_cents?: number
          appointment_count?: number
          blocking_issue_count?: number
          bonus_total_cents?: number
          calculation_status?: string
          commission_compensation_cents?: number
          compensated_minutes?: number
          compensation_assignment_id?: string | null
          compensation_plan_version_id?: string | null
          completed_session_count?: number
          created_at?: string
          deduction_total_cents?: number
          eligible_basis_total_cents?: number
          final_gross_compensation_cents?: number
          flat_rate_compensation_cents?: number
          hourly_compensation_cents?: number
          id?: string
          notes?: string
          organization_id?: string
          payroll_run_id?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          team_compensation_cents?: number
          trainer_id?: string
          updated_at?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_trainer_summaries_compensation_assignment_id_fkey"
            columns: ["compensation_assignment_id"]
            isOneToOne: false
            referencedRelation: "trainer_compensation_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_trainer_summaries_compensation_plan_version_id_fkey"
            columns: ["compensation_plan_version_id"]
            isOneToOne: false
            referencedRelation: "compensation_plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_trainer_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_trainer_summaries_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_trainer_summaries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_trainer_summaries_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_benchmarks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          department_id: string | null
          deprecated_at: string | null
          effective_from: string
          effective_to: string | null
          evidence: string
          id: string
          metric_id: string
          metric_unit: string
          metric_version: string
          name: string
          notes: string | null
          organization_id: string
          scope_level: string
          service_id: string | null
          source_period_from: string | null
          source_period_to: string | null
          source_type: string
          status: string
          trainer_id: string | null
          updated_at: string
          value: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          department_id?: string | null
          deprecated_at?: string | null
          effective_from: string
          effective_to?: string | null
          evidence: string
          id?: string
          metric_id: string
          metric_unit: string
          metric_version: string
          name: string
          notes?: string | null
          organization_id: string
          scope_level: string
          service_id?: string | null
          source_period_from?: string | null
          source_period_to?: string | null
          source_type: string
          status?: string
          trainer_id?: string | null
          updated_at?: string
          value: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          department_id?: string | null
          deprecated_at?: string | null
          effective_from?: string
          effective_to?: string | null
          evidence?: string
          id?: string
          metric_id?: string
          metric_unit?: string
          metric_version?: string
          name?: string
          notes?: string | null
          organization_id?: string
          scope_level?: string
          service_id?: string | null
          source_period_from?: string | null
          source_period_to?: string | null
          source_type?: string
          status?: string
          trainer_id?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_benchmarks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_benchmarks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_benchmarks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_benchmarks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_benchmarks_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_benchmarks_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_goal_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event_type: string
          from_status: string | null
          goal_id: string
          id: string
          organization_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          from_status?: string | null
          goal_id: string
          id?: string
          organization_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          from_status?: string | null
          goal_id?: string
          id?: string
          organization_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_goal_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goal_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "performance_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goal_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_goal_progress_snapshots: {
        Row: {
          as_of_date: string
          created_at: string
          created_by: string | null
          detail: Json
          goal_id: string
          id: string
          metric_health: string
          metric_value: number | null
          organization_id: string
          progress_status: string
        }
        Insert: {
          as_of_date: string
          created_at?: string
          created_by?: string | null
          detail?: Json
          goal_id: string
          id?: string
          metric_health: string
          metric_value?: number | null
          organization_id: string
          progress_status: string
        }
        Update: {
          as_of_date?: string
          created_at?: string
          created_by?: string | null
          detail?: Json
          goal_id?: string
          id?: string
          metric_health?: string
          metric_value?: number | null
          organization_id?: string
          progress_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_goal_progress_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goal_progress_snapshots_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "performance_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goal_progress_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_goals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          baseline_period_id: string | null
          baseline_value: number | null
          completed_at: string | null
          created_at: string
          created_by: string
          department_id: string | null
          end_date: string
          goal_type: string
          id: string
          measurement_cadence: string
          metric_id: string
          metric_unit: string
          metric_version: string
          name: string
          notes: string | null
          organization_id: string
          owner_id: string | null
          reporting_period_id: string | null
          scope_level: string
          service_id: string | null
          start_date: string
          status: string
          target_high: number | null
          target_low: number | null
          target_value: number | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          baseline_period_id?: string | null
          baseline_value?: number | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          department_id?: string | null
          end_date: string
          goal_type: string
          id?: string
          measurement_cadence?: string
          metric_id: string
          metric_unit: string
          metric_version: string
          name: string
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          reporting_period_id?: string | null
          scope_level: string
          service_id?: string | null
          start_date: string
          status?: string
          target_high?: number | null
          target_low?: number | null
          target_value?: number | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          baseline_period_id?: string | null
          baseline_value?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          department_id?: string | null
          end_date?: string
          goal_type?: string
          id?: string
          measurement_cadence?: string
          metric_id?: string
          metric_unit?: string
          metric_version?: string
          name?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          reporting_period_id?: string | null
          scope_level?: string
          service_id?: string | null
          start_date?: string
          status?: string
          target_high?: number | null
          target_low?: number | null
          target_value?: number | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_goals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_baseline_period_id_fkey"
            columns: ["baseline_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      period_close_acknowledgements: {
        Row: {
          acknowledged_by: string | null
          check_code: string
          close_version: number
          created_at: string
          id: string
          note: string
          organization_id: string
          period_close_run_id: string
        }
        Insert: {
          acknowledged_by?: string | null
          check_code: string
          close_version: number
          created_at?: string
          id?: string
          note?: string
          organization_id: string
          period_close_run_id: string
        }
        Update: {
          acknowledged_by?: string | null
          check_code?: string
          close_version?: number
          created_at?: string
          id?: string
          note?: string
          organization_id?: string
          period_close_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_close_acknowledgements_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_acknowledgements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_acknowledgements_period_close_run_id_fkey"
            columns: ["period_close_run_id"]
            isOneToOne: false
            referencedRelation: "period_close_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      period_close_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          organization_id: string
          period_close_run_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          organization_id: string
          period_close_run_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          organization_id?: string
          period_close_run_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_close_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_events_period_close_run_id_fkey"
            columns: ["period_close_run_id"]
            isOneToOne: false
            referencedRelation: "period_close_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      period_close_manifests: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          manifest_sha256: string
          organization_id: string
          payload: Json
          period_close_run_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          manifest_sha256: string
          organization_id: string
          payload: Json
          period_close_run_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          manifest_sha256?: string
          organization_id?: string
          payload?: Json
          period_close_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_close_manifests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_manifests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_manifests_period_close_run_id_fkey"
            columns: ["period_close_run_id"]
            isOneToOne: true
            referencedRelation: "period_close_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      period_close_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          blocking_issue_count: number
          close_notes: string
          close_version: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          initiated_at: string
          initiated_by: string | null
          manifest_sha256: string | null
          organization_id: string
          readiness_snapshot: Json
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          report_package_id: string | null
          reporting_period_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_cutoff_at: string | null
          status: string
          superseded_by_close_run_id: string | null
          supersedes_close_run_id: string | null
          updated_at: string
          warning_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          blocking_issue_count?: number
          close_notes?: string
          close_version?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          manifest_sha256?: string | null
          organization_id: string
          readiness_snapshot?: Json
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          report_package_id?: string | null
          reporting_period_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_cutoff_at?: string | null
          status?: string
          superseded_by_close_run_id?: string | null
          supersedes_close_run_id?: string | null
          updated_at?: string
          warning_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          blocking_issue_count?: number
          close_notes?: string
          close_version?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          manifest_sha256?: string | null
          organization_id?: string
          readiness_snapshot?: Json
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          report_package_id?: string | null
          reporting_period_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_cutoff_at?: string | null
          status?: string
          superseded_by_close_run_id?: string | null
          supersedes_close_run_id?: string | null
          updated_at?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "period_close_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_package_fkey"
            columns: ["report_package_id"]
            isOneToOne: false
            referencedRelation: "report_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_superseded_by_close_run_id_fkey"
            columns: ["superseded_by_close_run_id"]
            isOneToOne: false
            referencedRelation: "period_close_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_runs_supersedes_close_run_id_fkey"
            columns: ["supersedes_close_run_id"]
            isOneToOne: false
            referencedRelation: "period_close_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_packages: {
        Row: {
          created_at: string
          dashboard_id: string | null
          department_id: string | null
          failure_reason: string | null
          filters: Json
          generated_at: string
          generated_by: string | null
          id: string
          intelligence_version: string | null
          organization_id: string
          package_sha256: string | null
          package_type: string
          payload: Json
          payroll_run_id: string | null
          payroll_snapshot_version: number | null
          period_close_run_id: string | null
          reporting_period_id: string
          status: string
          superseded_by_package_id: string | null
          supersedes_package_id: string | null
          updated_at: string
          version: number
          warnings: Json
        }
        Insert: {
          created_at?: string
          dashboard_id?: string | null
          department_id?: string | null
          failure_reason?: string | null
          filters?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          intelligence_version?: string | null
          organization_id: string
          package_sha256?: string | null
          package_type: string
          payload?: Json
          payroll_run_id?: string | null
          payroll_snapshot_version?: number | null
          period_close_run_id?: string | null
          reporting_period_id: string
          status?: string
          superseded_by_package_id?: string | null
          supersedes_package_id?: string | null
          updated_at?: string
          version?: number
          warnings?: Json
        }
        Update: {
          created_at?: string
          dashboard_id?: string | null
          department_id?: string | null
          failure_reason?: string | null
          filters?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          intelligence_version?: string | null
          organization_id?: string
          package_sha256?: string | null
          package_type?: string
          payload?: Json
          payroll_run_id?: string | null
          payroll_snapshot_version?: number | null
          period_close_run_id?: string | null
          reporting_period_id?: string
          status?: string
          superseded_by_package_id?: string | null
          supersedes_package_id?: string | null
          updated_at?: string
          version?: number
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_packages_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "analytics_dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_period_close_run_id_fkey"
            columns: ["period_close_run_id"]
            isOneToOne: false
            referencedRelation: "period_close_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_superseded_by_package_id_fkey"
            columns: ["superseded_by_package_id"]
            isOneToOne: false
            referencedRelation: "report_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_packages_supersedes_package_id_fkey"
            columns: ["supersedes_package_id"]
            isOneToOne: false
            referencedRelation: "report_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_periods: {
        Row: {
          created_at: string
          end_date: string
          id: string
          label: string
          notes: string
          organization_id: string
          payment_date: string | null
          period_type: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          label: string
          notes?: string
          organization_id: string
          payment_date?: string | null
          period_type?: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          label?: string
          notes?: string
          organization_id?: string
          payment_date?: string | null
          period_type?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporting_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          department_scoped: boolean
          description: string
          id: string
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_scoped?: boolean
          description?: string
          id?: string
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_scoped?: boolean
          description?: string
          id?: string
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          config: Json
          created_at: string
          department_id: string | null
          id: string
          is_default: boolean
          kind: string
          last_used_at: string | null
          name: string
          organization_id: string | null
          owner_id: string
          page: string
          pinned: boolean
          shared_scope: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          department_id?: string | null
          id?: string
          is_default?: boolean
          kind: string
          last_used_at?: string | null
          name: string
          organization_id?: string | null
          owner_id: string
          page: string
          pinned?: boolean
          shared_scope?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          department_id?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string | null
          owner_id?: string
          page?: string
          pinned?: boolean
          shared_scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_report_definitions: {
        Row: {
          active: boolean
          created_at: string
          dashboard_id: string | null
          delivery_channel: string
          department_id: string | null
          execution_enabled: boolean
          frequency: string
          id: string
          last_intended_run: string | null
          next_intended_run: string | null
          organization_id: string
          owner_id: string
          recipients: Json
          report_type: string
          saved_view_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dashboard_id?: string | null
          delivery_channel?: string
          department_id?: string | null
          execution_enabled?: boolean
          frequency: string
          id?: string
          last_intended_run?: string | null
          next_intended_run?: string | null
          organization_id: string
          owner_id: string
          recipients?: Json
          report_type: string
          saved_view_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dashboard_id?: string | null
          delivery_channel?: string
          department_id?: string | null
          execution_enabled?: boolean
          frequency?: string
          id?: string
          last_intended_run?: string | null
          next_intended_run?: string | null
          organization_id?: string
          owner_id?: string
          recipients?: Json
          report_type?: string
          saved_view_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_report_definitions_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "analytics_dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_definitions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_definitions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_definitions_saved_view_id_fkey"
            columns: ["saved_view_id"]
            isOneToOne: false
            referencedRelation: "saved_views"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_report_runs: {
        Row: {
          artifact: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          definition_id: string
          export_event_id: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          intended_run_at: string
          is_final: boolean
          job_id: string | null
          organization_id: string
          report_package_id: string | null
          started_at: string | null
          status: string
          trigger_source: string
        }
        Insert: {
          artifact?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          definition_id: string
          export_event_id?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          intended_run_at: string
          is_final?: boolean
          job_id?: string | null
          organization_id: string
          report_package_id?: string | null
          started_at?: string | null
          status?: string
          trigger_source?: string
        }
        Update: {
          artifact?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          definition_id?: string
          export_event_id?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          intended_run_at?: string
          is_final?: boolean
          job_id?: string | null
          organization_id?: string
          report_package_id?: string | null
          started_at?: string | null
          status?: string
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_report_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_runs_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "scheduled_report_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_runs_report_package_id_fkey"
            columns: ["report_package_id"]
            isOneToOne: false
            referencedRelation: "report_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_department_assignments: {
        Row: {
          created_at: string
          department_id: string
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          service_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id: string
          service_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_department_assignment_department_id_organization_i_fkey"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "service_department_assignments_service_id_organization_id_fkey"
            columns: ["service_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      service_source_aliases: {
        Row: {
          alias: string
          alias_normalized: string | null
          created_at: string
          id: string
          organization_id: string
          service_id: string
          source: string
          updated_at: string
        }
        Insert: {
          alias: string
          alias_normalized?: string | null
          created_at?: string
          id?: string
          organization_id: string
          service_id: string
          source: string
          updated_at?: string
        }
        Update: {
          alias?: string
          alias_normalized?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          service_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_source_aliases_service_id_organization_id_fkey"
            columns: ["service_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string
          counts_as_coaching_hours: boolean
          counts_as_session: boolean
          created_at: string
          default_duration_minutes: number
          description: string
          display_name: string
          effective_from: string
          effective_to: string | null
          id: string
          internal_name: string
          is_evaluation: boolean
          is_group_training: boolean
          is_nutrition: boolean
          is_team_training: boolean
          organization_id: string
          payroll_eligible: boolean
          revenue_eligible: boolean
          status: string
          updated_at: string
        }
        Insert: {
          category_id: string
          counts_as_coaching_hours?: boolean
          counts_as_session?: boolean
          created_at?: string
          default_duration_minutes?: number
          description?: string
          display_name: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          internal_name: string
          is_evaluation?: boolean
          is_group_training?: boolean
          is_nutrition?: boolean
          is_team_training?: boolean
          organization_id: string
          payroll_eligible?: boolean
          revenue_eligible?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          counts_as_coaching_hours?: boolean
          counts_as_session?: boolean
          created_at?: string
          default_duration_minutes?: number
          description?: string
          display_name?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          internal_name?: string
          is_evaluation?: boolean
          is_group_training?: boolean
          is_nutrition?: boolean
          is_team_training?: boolean
          organization_id?: string
          payroll_eligible?: boolean
          revenue_eligible?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_organization_id_fkey"
            columns: ["category_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      source_status_mappings: {
        Row: {
          canonical_status: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          source: string
          source_value_normalized: string
          updated_at: string
        }
        Insert: {
          canonical_status: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          source: string
          source_value_normalized: string
          updated_at?: string
        }
        Update: {
          canonical_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          source?: string
          source_value_normalized?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_status_mappings_canonical_status_fkey"
            columns: ["canonical_status"]
            isOneToOne: false
            referencedRelation: "appointment_status_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "source_status_mappings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_status_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_compensation_assignments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          notes: string
          organization_id: string
          plan_version_id: string
          purpose: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string
          organization_id: string
          plan_version_id: string
          purpose?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string
          organization_id?: string
          plan_version_id?: string
          purpose?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_compensation_assignme_plan_version_id_organization_fkey"
            columns: ["plan_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "compensation_plan_versions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "trainer_compensation_assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_department_assignments: {
        Row: {
          created_at: string
          department_id: string
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_department_assignment_department_id_organization_i_fkey"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "trainer_department_assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_organization_assignments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          title: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id: string
          title?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          title?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_organization_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_organization_assignments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_source_aliases: {
        Row: {
          alias: string
          alias_normalized: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          source: string
          trainer_id: string
        }
        Insert: {
          alias: string
          alias_normalized?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          source: string
          trainer_id: string
        }
        Update: {
          alias?: string
          alias_normalized?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          source?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_source_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_source_aliases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_source_aliases_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          created_at: string
          default_organization_id: string | null
          display_name: string
          email: string | null
          employment_status: string
          first_name: string
          hire_date: string | null
          id: string
          last_name: string
          notes: string
          phone: string | null
          profile_id: string | null
          separation_date: string | null
          source_identifiers: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_organization_id?: string | null
          display_name: string
          email?: string | null
          employment_status?: string
          first_name?: string
          hire_date?: string | null
          id?: string
          last_name?: string
          notes?: string
          phone?: string | null
          profile_id?: string | null
          separation_date?: string | null
          source_identifiers?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_organization_id?: string | null
          display_name?: string
          email?: string | null
          employment_status?: string
          first_name?: string
          hire_date?: string | null
          id?: string
          last_name?: string
          notes?: string
          phone?: string | null
          profile_id?: string | null
          separation_date?: string | null
          source_identifiers?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainers_default_organization_id_fkey"
            columns: ["default_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      cancel_background_job: {
        Args: { p_job_id: string; p_reason: string }
        Returns: undefined
      }
      claim_background_jobs: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          available_at: string
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          correlation_id: string
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          max_attempts: number
          organization_id: string
          parent_job_id: string | null
          payload: Json
          payload_version: number
          result: Json | null
          scheduled_for: string
          started_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "background_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_background_job: {
        Args: { p_job_id: string; p_result?: Json; p_worker_id: string }
        Returns: undefined
      }
      dead_letter_background_job: {
        Args: { p_job_id: string; p_reason: string }
        Returns: undefined
      }
      enqueue_background_job: {
        Args: {
          p_idempotency_key: string
          p_job_type: string
          p_max_attempts?: number
          p_organization_id: string
          p_parent_job_id?: string
          p_payload: Json
          p_scheduled_for?: string
        }
        Returns: string
      }
      execute_period_close: {
        Args: { p_manifest: Json; p_manifest_sha256: string; p_run_id: string }
        Returns: Json
      }
      fail_background_job: {
        Args: {
          p_error: string
          p_error_code: string
          p_job_id: string
          p_retryable: boolean
          p_worker_id: string
        }
        Returns: string
      }
      get_connection_secret_with_key: {
        Args: { p_connection_id: string; p_server_key: string }
        Returns: string
      }
      get_invitation_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          organization_name: string
          role_name: string
          status: string
        }[]
      }
      lock_payroll_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: undefined
      }
      payroll_dependencies_for_batch: {
        Args: { p_batch_id: string }
        Returns: {
          payroll_run_id: string
          run_name: string
          run_status: string
        }[]
      }
      post_import_batch: { Args: { p_batch_id: string }; Returns: Json }
      post_payroll_run: { Args: { p_run_id: string }; Returns: Json }
      reopen_payroll_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: undefined
      }
      reopen_period_close: {
        Args: { p_reason: string; p_run_id: string }
        Returns: string
      }
      requeue_dead_letter_job: {
        Args: { p_job_id: string; p_reason: string }
        Returns: undefined
      }
      retry_background_job: { Args: { p_job_id: string }; Returns: undefined }
      reverse_import_batch: {
        Args: { p_batch_id: string; p_reason: string }
        Returns: Json
      }
      revoke_connection_secret: {
        Args: { p_connection_id: string; p_reason: string }
        Returns: undefined
      }
      start_background_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: undefined
      }
      store_connection_secret: {
        Args: { p_connection_id: string; p_secret: string }
        Returns: Json
      }
      supersede_payroll_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: string
      }
      void_payroll_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: undefined
      }
      void_period_close: {
        Args: { p_reason: string; p_run_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]),
> = (DefaultSchema["Tables"] &
  DefaultSchema["Views"])[TableName] extends { Row: infer R }
  ? R
  : never;

export type TablesInsert<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName] extends { Insert: infer I } ? I : never;

export type TablesUpdate<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName] extends { Update: infer U } ? U : never;

/* ----------------------------------------------------------------------------
 * Hand-written domain aliases (keep when regenerating).
 * ------------------------------------------------------------------------- */

export type OrganizationRow = Tables<"organizations">;
export type LocationRow = Tables<"locations">;
export type DepartmentRow = Tables<"departments">;
export type ProfileRow = Tables<"profiles">;
export type RoleRow = Tables<"roles">;
export type PermissionRow = Tables<"permissions">;
export type OrganizationMembershipRow = Tables<"organization_memberships">;
export type DepartmentMembershipRow = Tables<"department_memberships">;
export type TrainerRow = Tables<"trainers">;
export type TrainerOrganizationAssignmentRow =
  Tables<"trainer_organization_assignments">;
export type TrainerDepartmentAssignmentRow =
  Tables<"trainer_department_assignments">;
export type ReportingPeriodRow = Tables<"reporting_periods">;
export type AuditEventRow = Tables<"audit_events">;
export type InvitationRow = Tables<"invitations">;
export type ServiceCategoryRow = Tables<"service_categories">;
export type ServiceRow = Tables<"services">;
export type ServiceDepartmentAssignmentRow =
  Tables<"service_department_assignments">;
export type ServiceSourceAliasRow = Tables<"service_source_aliases">;
export type CompensationPlanRow = Tables<"compensation_plans">;
export type CompensationPlanVersionRow = Tables<"compensation_plan_versions">;
export type CommissionTierRow = Tables<"commission_tiers">;
export type CompensationRuleRow = Tables<"compensation_rules">;
export type TrainerCompensationAssignmentRow =
  Tables<"trainer_compensation_assignments">;
export type AppointmentTrainerAssignmentRow =
  Tables<"appointment_trainer_assignments">;
export type PayrollRunRow = Tables<"payroll_runs">;
export type PayrollRunEventRow = Tables<"payroll_run_events">;
export type PayrollTrainerSummaryRow = Tables<"payroll_trainer_summaries">;
export type PayrollCalculationLineRow = Tables<"payroll_calculation_lines">;
export type PayrollIssueRow = Tables<"payroll_issues">;
export type ManualTimeEntryRow = Tables<"manual_time_entries">;
export type PayrollAdjustmentRow = Tables<"payroll_adjustments">;
export type PayrollSnapshotRow = Tables<"payroll_snapshots">;
export type PayrollExportRow = Tables<"payroll_exports">;

export type ReportingPeriodStatus = "draft" | "open" | "closed" | "locked";
export type PeriodType = "monthly" | "semi_monthly" | "biweekly" | "custom";
export type AliasSource = "setmore" | "acuity" | "manual_csv";
