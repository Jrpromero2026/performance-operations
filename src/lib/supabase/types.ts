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
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: Json;
          organization_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_tiers: {
        Row: {
          created_at: string;
          effective_from: string | null;
          effective_to: string | null;
          id: string;
          max_revenue_cents: number | null;
          min_revenue_cents: number;
          organization_id: string;
          plan_version_id: string;
          rate_basis_points: number;
          sequence: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          effective_from?: string | null;
          effective_to?: string | null;
          id?: string;
          max_revenue_cents?: number | null;
          min_revenue_cents: number;
          organization_id: string;
          plan_version_id: string;
          rate_basis_points: number;
          sequence: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string | null;
          effective_to?: string | null;
          id?: string;
          max_revenue_cents?: number | null;
          min_revenue_cents?: number;
          organization_id?: string;
          plan_version_id?: string;
          rate_basis_points?: number;
          sequence?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commission_tiers_plan_version_id_organization_id_fkey";
            columns: ["plan_version_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plan_versions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      compensation_plan_versions: {
        Row: {
          compensation_method: string;
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          notes: string;
          organization_id: string;
          plan_id: string;
          status: string;
          tier_behavior: string;
          updated_at: string;
          version_number: number;
        };
        Insert: {
          compensation_method: string;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          notes?: string;
          organization_id: string;
          plan_id: string;
          status?: string;
          tier_behavior?: string;
          updated_at?: string;
          version_number: number;
        };
        Update: {
          compensation_method?: string;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          notes?: string;
          organization_id?: string;
          plan_id?: string;
          status?: string;
          tier_behavior?: string;
          updated_at?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "compensation_plan_versions_plan_id_organization_id_fkey";
            columns: ["plan_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plans";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      compensation_plans: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          name: string;
          notes: string;
          organization_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
          notes?: string;
          organization_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          notes?: string;
          organization_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compensation_plans_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      compensation_rules: {
        Row: {
          amount_cents: number | null;
          created_at: string;
          id: string;
          notes: string;
          organization_id: string;
          plan_version_id: string;
          rate_basis_points: number | null;
          rule_type: string;
          updated_at: string;
        };
        Insert: {
          amount_cents?: number | null;
          created_at?: string;
          id?: string;
          notes?: string;
          organization_id: string;
          plan_version_id: string;
          rate_basis_points?: number | null;
          rule_type: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number | null;
          created_at?: string;
          id?: string;
          notes?: string;
          organization_id?: string;
          plan_version_id?: string;
          rate_basis_points?: number | null;
          rule_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compensation_rules_plan_version_id_organization_id_fkey";
            columns: ["plan_version_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plan_versions";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      department_memberships: {
        Row: {
          created_at: string;
          department_id: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          organization_id: string;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          organization_id: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          organization_id?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "department_memberships_department_id_organization_id_fkey";
            columns: ["department_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "department_memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_profile_id: string | null;
          created_at: string;
          department_ids: string[];
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          role_id: string;
          status: string;
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_profile_id?: string | null;
          created_at?: string;
          department_ids?: string[];
          email: string;
          expires_at: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          role_id: string;
          status?: string;
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_profile_id?: string | null;
          created_at?: string;
          department_ids?: string[];
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id?: string;
          role_id?: string;
          status?: string;
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_profile_id_fkey";
            columns: ["accepted_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          address: string | null;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_memberships: {
        Row: {
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          is_default: boolean;
          organization_id: string;
          profile_id: string;
          role_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          is_default?: boolean;
          organization_id: string;
          profile_id: string;
          role_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          is_default?: boolean;
          organization_id?: string;
          profile_id?: string;
          role_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_memberships_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          status: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      permissions: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          key: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          key: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          key?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reporting_periods: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          label: string;
          notes: string;
          organization_id: string;
          payment_date: string | null;
          period_type: string;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          label: string;
          notes?: string;
          organization_id: string;
          payment_date?: string | null;
          period_type?: string;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          label?: string;
          notes?: string;
          organization_id?: string;
          payment_date?: string | null;
          period_type?: string;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reporting_periods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          permission_id: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          permission_id: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          permission_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          department_scoped: boolean;
          description: string;
          id: string;
          key: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_scoped?: boolean;
          description?: string;
          id?: string;
          key: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_scoped?: boolean;
          description?: string;
          id?: string;
          key?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          sort_order: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      service_department_assignments: {
        Row: {
          created_at: string;
          department_id: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          organization_id: string;
          service_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          organization_id: string;
          service_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          organization_id?: string;
          service_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_department_assignment_department_id_organization_i_fkey";
            columns: ["department_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "service_department_assignments_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      service_source_aliases: {
        Row: {
          alias: string;
          alias_normalized: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          service_id: string;
          source: string;
          updated_at: string;
        };
        Insert: {
          alias: string;
          alias_normalized?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          service_id: string;
          source: string;
          updated_at?: string;
        };
        Update: {
          alias?: string;
          alias_normalized?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          service_id?: string;
          source?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_source_aliases_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      services: {
        Row: {
          category_id: string;
          counts_as_coaching_hours: boolean;
          counts_as_session: boolean;
          created_at: string;
          default_duration_minutes: number;
          description: string;
          display_name: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          internal_name: string;
          is_evaluation: boolean;
          is_group_training: boolean;
          is_nutrition: boolean;
          is_team_training: boolean;
          organization_id: string;
          payroll_eligible: boolean;
          revenue_eligible: boolean;
          status: string;
          updated_at: string;
        };
        Insert: {
          category_id: string;
          counts_as_coaching_hours?: boolean;
          counts_as_session?: boolean;
          created_at?: string;
          default_duration_minutes?: number;
          description?: string;
          display_name: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          internal_name: string;
          is_evaluation?: boolean;
          is_group_training?: boolean;
          is_nutrition?: boolean;
          is_team_training?: boolean;
          organization_id: string;
          payroll_eligible?: boolean;
          revenue_eligible?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          counts_as_coaching_hours?: boolean;
          counts_as_session?: boolean;
          created_at?: string;
          default_duration_minutes?: number;
          description?: string;
          display_name?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          internal_name?: string;
          is_evaluation?: boolean;
          is_group_training?: boolean;
          is_nutrition?: boolean;
          is_team_training?: boolean;
          organization_id?: string;
          payroll_eligible?: boolean;
          revenue_eligible?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_category_id_organization_id_fkey";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      trainer_compensation_assignments: {
        Row: {
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          notes: string;
          organization_id: string;
          plan_version_id: string;
          purpose: string;
          trainer_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          notes?: string;
          organization_id: string;
          plan_version_id: string;
          purpose?: string;
          trainer_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          notes?: string;
          organization_id?: string;
          plan_version_id?: string;
          purpose?: string;
          trainer_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trainer_compensation_assignme_plan_version_id_organization_fkey";
            columns: ["plan_version_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plan_versions";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "trainer_compensation_assignments_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
      trainer_department_assignments: {
        Row: {
          created_at: string;
          department_id: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          organization_id: string;
          trainer_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          organization_id: string;
          trainer_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          organization_id?: string;
          trainer_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trainer_department_assignment_department_id_organization_i_fkey";
            columns: ["department_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "trainer_department_assignments_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
      trainer_organization_assignments: {
        Row: {
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          organization_id: string;
          title: string;
          trainer_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          organization_id: string;
          title?: string;
          trainer_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          organization_id?: string;
          title?: string;
          trainer_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trainer_organization_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainer_organization_assignments_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
      trainers: {
        Row: {
          created_at: string;
          default_organization_id: string | null;
          display_name: string;
          email: string | null;
          employment_status: string;
          first_name: string;
          hire_date: string | null;
          id: string;
          last_name: string;
          notes: string;
          phone: string | null;
          profile_id: string | null;
          separation_date: string | null;
          source_identifiers: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_organization_id?: string | null;
          display_name: string;
          email?: string | null;
          employment_status?: string;
          first_name?: string;
          hire_date?: string | null;
          id?: string;
          last_name?: string;
          notes?: string;
          phone?: string | null;
          profile_id?: string | null;
          separation_date?: string | null;
          source_identifiers?: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_organization_id?: string | null;
          display_name?: string;
          email?: string | null;
          employment_status?: string;
          first_name?: string;
          hire_date?: string | null;
          id?: string;
          last_name?: string;
          notes?: string;
          phone?: string | null;
          profile_id?: string | null;
          separation_date?: string | null;
          source_identifiers?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trainers_default_organization_id_fkey";
            columns: ["default_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: {
          email: string;
          organization_name: string;
          role_name: string;
          status: string;
          expires_at: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

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

export type ReportingPeriodStatus = "draft" | "open" | "closed" | "locked";
export type PeriodType = "monthly" | "semi_monthly" | "biweekly" | "custom";
export type AliasSource = "setmore" | "acuity" | "manual_csv";
