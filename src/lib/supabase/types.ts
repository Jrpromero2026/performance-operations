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
          rounding_scope: string | null;
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
          rounding_scope?: string | null;
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
          rounding_scope?: string | null;
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
          basis_type: string | null;
          created_at: string;
          criteria: Json;
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
          basis_type?: string | null;
          created_at?: string;
          criteria?: Json;
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
          basis_type?: string | null;
          created_at?: string;
          criteria?: Json;
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
      /* ------------------------------------------------------------------
       * Phase 3 tables (hand-maintained to match migrations 11–13; compact
       * form — Insert derived from Row; regenerate via Supabase gen-types
       * for full fidelity when convenient).
       * ---------------------------------------------------------------- */
      clients: {
        Row: {
          id: string; first_name: string; last_name: string; display_name: string;
          email: string | null; phone: string | null; status: string; notes: string;
          created_at: string; updated_at: string;
        };
        Insert: { display_name: string } & Partial<{
          id: string; first_name: string; last_name: string; email: string | null;
          phone: string | null; status: string; notes: string; created_at: string; updated_at: string;
        }>;
        Update: Partial<{
          first_name: string; last_name: string; display_name: string;
          email: string | null; phone: string | null; status: string; notes: string;
        }>;
        Relationships: [];
      };
      client_organization_assignments: {
        Row: {
          id: string; client_id: string; organization_id: string;
          effective_from: string; effective_to: string | null;
          created_at: string; updated_at: string;
        };
        Insert: { client_id: string; organization_id: string } & Partial<{
          id: string; effective_from: string; effective_to: string | null;
        }>;
        Update: Partial<{ effective_from: string; effective_to: string | null }>;
        Relationships: [];
      };
      client_source_identifiers: {
        Row: {
          id: string; client_id: string; organization_id: string; source: string;
          external_id: string; created_by: string | null; created_at: string;
        };
        Insert: {
          client_id: string; organization_id: string; source: string; external_id: string;
        } & Partial<{ id: string; created_by: string | null }>;
        Update: never;
        Relationships: [];
      };
      trainer_source_aliases: {
        Row: {
          id: string; organization_id: string; trainer_id: string; source: string;
          alias: string; alias_normalized: string | null; created_by: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string; trainer_id: string; source: string; alias: string;
        } & Partial<{ id: string; created_by: string | null }>;
        Update: never;
        Relationships: [];
      };
      appointment_status_definitions: {
        Row: { key: string; label: string; sort_order: number; created_at: string };
        Insert: { key: string; label: string } & Partial<{ sort_order: number }>;
        Update: Partial<{ label: string; sort_order: number }>;
        Relationships: [];
      };
      source_status_mappings: {
        Row: {
          id: string; organization_id: string; source: string;
          source_value_normalized: string; canonical_status: string;
          created_by: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          organization_id: string; source: string; source_value_normalized: string;
          canonical_status: string;
        } & Partial<{ id: string; created_by: string | null }>;
        Update: Partial<{ canonical_status: string }>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string; organization_id: string; source: string;
          source_account_identifier: string | null; original_filename: string;
          storage_path: string; file_hash: string; file_size: number; mime_type: string;
          adapter_version: string; schema_profile_id: string | null;
          total_row_count: number; accepted_row_count: number; warning_row_count: number;
          blocked_row_count: number; duplicate_row_count: number; excluded_row_count: number;
          posted_row_count: number; status: string; uploaded_by: string | null;
          uploaded_at: string; parsing_started_at: string | null;
          parsing_completed_at: string | null; approved_by: string | null;
          approved_at: string | null; posted_by: string | null; posted_at: string | null;
          reversed_by: string | null; reversed_at: string | null;
          failure_code: string | null; sanitized_failure_message: string | null;
          metadata: Json; created_at: string; updated_at: string;
        };
        Insert: {
          organization_id: string; source: string; original_filename: string;
          storage_path: string; file_hash: string; file_size: number; mime_type: string;
        } & Partial<{
          id: string; source_account_identifier: string | null; adapter_version: string;
          schema_profile_id: string | null; status: string; uploaded_by: string | null;
          metadata: Json;
        }>;
        Update: Partial<{
          status: string; adapter_version: string; schema_profile_id: string | null;
          storage_path: string;
          total_row_count: number; accepted_row_count: number; warning_row_count: number;
          blocked_row_count: number; duplicate_row_count: number; excluded_row_count: number;
          posted_row_count: number; parsing_started_at: string | null;
          parsing_completed_at: string | null; approved_by: string | null;
          approved_at: string | null; failure_code: string | null;
          sanitized_failure_message: string | null; metadata: Json;
        }>;
        Relationships: [];
      };
      import_schema_profiles: {
        Row: {
          id: string; organization_id: string; source: string; name: string;
          header_signature: string; column_mappings: Json; version: number;
          created_by: string | null; created_at: string;
        };
        Insert: {
          organization_id: string; source: string; name: string;
          header_signature: string; column_mappings: Json;
        } & Partial<{ id: string; version: number; created_by: string | null }>;
        Update: never;
        Relationships: [];
      };
      import_rows: {
        Row: {
          id: string; import_batch_id: string; organization_id: string;
          source_row_number: number; original_row: Json; normalized_row: Json;
          corrections: Json; row_hash: string; processing_status: string;
          duplicate_class: string | null; blocking_issue_count: number;
          warning_count: number; info_count: number; appointment_date: string | null;
          start_at: string | null; end_at: string | null; duration_minutes: number | null;
          canonical_status: string | null; external_appointment_id: string | null;
          listed_price_cents: number | null; amount_paid_cents: number | null;
          currency: string; matched_trainer_id: string | null;
          trainer_match_method: string | null; matched_service_id: string | null;
          service_match_method: string | null; matched_client_id: string | null;
          client_match_method: string | null; proposed_department_id: string | null;
          posted_appointment_id: string | null; exclusion_reason: string | null;
          excluded_by: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          import_batch_id: string; organization_id: string; source_row_number: number;
          original_row: Json; row_hash: string;
        } & Partial<{
          id: string; normalized_row: Json; corrections: Json; processing_status: string;
          duplicate_class: string | null; blocking_issue_count: number;
          warning_count: number; info_count: number; appointment_date: string | null;
          start_at: string | null; end_at: string | null; duration_minutes: number | null;
          canonical_status: string | null; external_appointment_id: string | null;
          listed_price_cents: number | null; amount_paid_cents: number | null;
          currency: string; matched_trainer_id: string | null;
          trainer_match_method: string | null; matched_service_id: string | null;
          service_match_method: string | null; matched_client_id: string | null;
          client_match_method: string | null; proposed_department_id: string | null;
        }>;
        Update: Partial<{
          normalized_row: Json; corrections: Json; processing_status: string;
          duplicate_class: string | null; blocking_issue_count: number;
          warning_count: number; info_count: number; appointment_date: string | null;
          start_at: string | null; end_at: string | null; duration_minutes: number | null;
          canonical_status: string | null; external_appointment_id: string | null;
          listed_price_cents: number | null; amount_paid_cents: number | null;
          matched_trainer_id: string | null; trainer_match_method: string | null;
          matched_service_id: string | null; service_match_method: string | null;
          matched_client_id: string | null; client_match_method: string | null;
          proposed_department_id: string | null; posted_appointment_id: string | null;
          exclusion_reason: string | null; excluded_by: string | null;
        }>;
        Relationships: [];
      };
      import_row_issues: {
        Row: {
          id: string; import_row_id: string; import_batch_id: string;
          organization_id: string; code: string; severity: string;
          field: string | null; message: string; original_value: string | null;
          suggested_action: string | null; resolution_status: string;
          resolved_by: string | null; resolved_at: string | null;
          resolution_note: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          import_row_id: string; import_batch_id: string; organization_id: string;
          code: string; severity: string; message: string;
        } & Partial<{
          id: string; field: string | null; original_value: string | null;
          suggested_action: string | null; resolution_status: string;
        }>;
        Update: Partial<{
          resolution_status: string; resolved_by: string | null;
          resolved_at: string | null; resolution_note: string | null;
        }>;
        Relationships: [];
      };
      import_resolutions: {
        Row: {
          id: string; import_batch_id: string; organization_id: string;
          import_row_id: string | null; action: string; payload: Json;
          affected_row_count: number; actor_id: string | null; created_at: string;
        };
        Insert: {
          import_batch_id: string; organization_id: string; action: string;
          actor_id: string;
        } & Partial<{
          id: string; import_row_id: string | null; payload: Json;
          affected_row_count: number;
        }>;
        Update: never;
        Relationships: [];
      };
      import_batch_events: {
        Row: {
          id: string; import_batch_id: string; organization_id: string;
          from_status: string | null; to_status: string; actor_id: string | null;
          reason: string | null; created_at: string;
        };
        Insert: {
          import_batch_id: string; organization_id: string; to_status: string;
        } & Partial<{
          id: string; from_status: string | null; actor_id: string | null;
          reason: string | null;
        }>;
        Update: never;
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string; organization_id: string; department_id: string | null;
          trainer_id: string; client_id: string | null; service_id: string;
          appointment_date: string; start_at: string; end_at: string;
          duration_minutes: number; timezone: string; canonical_status: string;
          record_state: string; source: string;
          external_appointment_id: string | null; source_created_at: string | null;
          source_updated_at: string | null; source_listed_price_cents: number | null;
          source_amount_paid_cents: number | null; source_amount_due_cents: number | null;
          currency: string; payment_status: string | null; participant_count: number;
          notes: string; import_batch_id: string; import_row_id: string;
          posted_at: string; created_at: string; updated_at: string;
        };
        Insert: never; // created only via post_import_batch RPC
        Update: Partial<{
          department_id: string | null; canonical_status: string; record_state: string;
          notes: string; payment_status: string | null;
        }>;
        Relationships: [];
      };
      appointment_participants: {
        Row: {
          id: string; appointment_id: string; organization_id: string;
          client_id: string; role: string; created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      appointment_status_history: {
        Row: {
          id: string; appointment_id: string; organization_id: string;
          previous_status: string | null; new_status: string; change_source: string;
          reason: string | null; changed_by: string | null; created_at: string;
        };
        Insert: {
          appointment_id: string; organization_id: string; new_status: string;
          change_source: string; changed_by: string;
        } & Partial<{ id: string; previous_status: string | null; reason: string | null }>;
        Update: never;
        Relationships: [];
      };
      appointment_source_links: {
        Row: {
          id: string; appointment_id: string; organization_id: string;
          import_batch_id: string; import_row_id: string; source: string;
          external_appointment_id: string | null; link_type: string; created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      appointment_corrections: {
        Row: {
          id: string; appointment_id: string; organization_id: string;
          field: string; previous_value: string | null; new_value: string | null;
          reason: string; change_source: string; corrected_by: string | null;
          created_at: string;
        };
        Insert: {
          appointment_id: string; organization_id: string; field: string;
          reason: string; corrected_by: string;
        } & Partial<{
          id: string; previous_value: string | null; new_value: string | null;
          change_source: string;
        }>;
        Update: never;
        Relationships: [];
      };
      /* ------------------------------------------------------------------
       * Phase 4 tables (hand-maintained to match migrations 14–15; compact
       * form — Insert derived from Row; regenerate via Supabase gen-types
       * for full fidelity when convenient).
       * ---------------------------------------------------------------- */
      appointment_trainer_assignments: {
        Row: {
          id: string; appointment_id: string; organization_id: string;
          trainer_id: string; role: string; compensated_minutes: number | null;
          allocation_basis: string | null; source: string;
          confirmed_by: string | null; confirmed_at: string | null;
          status: string; created_at: string; updated_at: string;
        };
        Insert: {
          appointment_id: string; organization_id: string; trainer_id: string;
        } & Partial<{
          id: string; role: string; compensated_minutes: number | null;
          allocation_basis: string | null; source: string;
          confirmed_by: string | null; confirmed_at: string | null; status: string;
        }>;
        Update: Partial<{
          role: string; compensated_minutes: number | null;
          allocation_basis: string | null; confirmed_by: string | null;
          confirmed_at: string | null; status: string;
        }>;
        Relationships: [];
      };
      payroll_runs: {
        Row: {
          id: string; organization_id: string; reporting_period_id: string;
          name: string; run_number: number; status: string;
          calculation_version: string; source_appointment_cutoff_at: string | null;
          calculation_started_at: string | null; calculation_completed_at: string | null;
          reviewed_by: string | null; reviewed_at: string | null;
          approved_by: string | null; approved_at: string | null;
          posted_by: string | null; posted_at: string | null;
          locked_by: string | null; locked_at: string | null;
          reopened_by: string | null; reopened_at: string | null;
          reopen_reason: string | null;
          voided_by: string | null; voided_at: string | null; void_reason: string | null;
          supersedes_payroll_run_id: string | null;
          superseded_by_payroll_run_id: string | null;
          gross_compensation_total_cents: number; adjustment_total_cents: number;
          final_compensation_total_cents: number; trainer_count: number;
          appointment_count: number; blocking_issue_count: number;
          warning_count: number; failure_code: string | null;
          sanitized_failure_message: string | null; metadata: Json;
          created_by: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          organization_id: string; reporting_period_id: string; name: string;
          created_by: string;
        } & Partial<{
          id: string; run_number: number; status: string; calculation_version: string;
          source_appointment_cutoff_at: string | null;
          supersedes_payroll_run_id: string | null; metadata: Json;
        }>;
        Update: Partial<{
          name: string; status: string;
          source_appointment_cutoff_at: string | null;
          calculation_started_at: string | null; calculation_completed_at: string | null;
          reviewed_by: string | null; reviewed_at: string | null;
          approved_by: string | null; approved_at: string | null;
          gross_compensation_total_cents: number; adjustment_total_cents: number;
          final_compensation_total_cents: number; trainer_count: number;
          appointment_count: number; blocking_issue_count: number;
          warning_count: number; failure_code: string | null;
          sanitized_failure_message: string | null; metadata: Json;
        }>;
        Relationships: [];
      };
      payroll_run_events: {
        Row: {
          id: string; payroll_run_id: string; organization_id: string;
          from_status: string | null; to_status: string; actor_id: string | null;
          reason: string | null; created_at: string;
        };
        Insert: {
          payroll_run_id: string; organization_id: string; to_status: string;
        } & Partial<{
          id: string; from_status: string | null; actor_id: string | null;
          reason: string | null;
        }>;
        Update: never;
        Relationships: [];
      };
      payroll_trainer_summaries: {
        Row: {
          id: string; payroll_run_id: string; organization_id: string;
          trainer_id: string; compensation_assignment_id: string | null;
          compensation_plan_version_id: string | null; calculation_status: string;
          appointment_count: number; completed_session_count: number;
          compensated_minutes: number; eligible_basis_total_cents: number;
          commission_compensation_cents: number; flat_rate_compensation_cents: number;
          hourly_compensation_cents: number; team_compensation_cents: number;
          bonus_total_cents: number; deduction_total_cents: number;
          adjustment_total_cents: number; final_gross_compensation_cents: number;
          blocking_issue_count: number; warning_count: number;
          review_status: string; reviewed_by: string | null; reviewed_at: string | null;
          notes: string; created_at: string; updated_at: string;
        };
        Insert: {
          payroll_run_id: string; organization_id: string; trainer_id: string;
        } & Partial<{
          id: string; compensation_assignment_id: string | null;
          compensation_plan_version_id: string | null; calculation_status: string;
          appointment_count: number; completed_session_count: number;
          compensated_minutes: number; eligible_basis_total_cents: number;
          commission_compensation_cents: number; flat_rate_compensation_cents: number;
          hourly_compensation_cents: number; team_compensation_cents: number;
          bonus_total_cents: number; deduction_total_cents: number;
          adjustment_total_cents: number; final_gross_compensation_cents: number;
          blocking_issue_count: number; warning_count: number; notes: string;
        }>;
        Update: Partial<{
          compensation_assignment_id: string | null;
          compensation_plan_version_id: string | null; calculation_status: string;
          appointment_count: number; completed_session_count: number;
          compensated_minutes: number; eligible_basis_total_cents: number;
          commission_compensation_cents: number; flat_rate_compensation_cents: number;
          hourly_compensation_cents: number; team_compensation_cents: number;
          bonus_total_cents: number; deduction_total_cents: number;
          adjustment_total_cents: number; final_gross_compensation_cents: number;
          blocking_issue_count: number; warning_count: number;
          review_status: string; reviewed_by: string | null; reviewed_at: string | null;
          notes: string;
        }>;
        Relationships: [];
      };
      payroll_calculation_lines: {
        Row: {
          id: string; payroll_run_id: string; trainer_summary_id: string;
          organization_id: string; trainer_id: string;
          appointment_id: string | null;
          appointment_trainer_assignment_id: string | null;
          manual_time_entry_id: string | null; payroll_adjustment_id: string | null;
          compensation_plan_version_id: string | null;
          compensation_rule_id: string | null; line_type: string;
          calculation_status: string; input_quantity: number | null;
          input_unit: string | null; basis_amount_cents: number | null;
          rate_amount_cents: number | null; rate_basis_points: number | null;
          calculated_amount_cents: number; rounded_amount_cents: number;
          rounding_method: string; eligibility_result: string;
          exclusion_reason: string | null; calculation_formula_version: string;
          calculation_trace: Json; created_at: string;
        };
        Insert: {
          payroll_run_id: string; trainer_summary_id: string;
          organization_id: string; trainer_id: string; line_type: string;
        } & Partial<{
          id: string; appointment_id: string | null;
          appointment_trainer_assignment_id: string | null;
          manual_time_entry_id: string | null; payroll_adjustment_id: string | null;
          compensation_plan_version_id: string | null;
          compensation_rule_id: string | null; calculation_status: string;
          input_quantity: number | null; input_unit: string | null;
          basis_amount_cents: number | null; rate_amount_cents: number | null;
          rate_basis_points: number | null; calculated_amount_cents: number;
          rounded_amount_cents: number; rounding_method: string;
          eligibility_result: string; exclusion_reason: string | null;
          calculation_formula_version: string; calculation_trace: Json;
        }>;
        Update: never; // recalculation deletes + reinserts while the run is mutable
        Relationships: [];
      };
      payroll_issues: {
        Row: {
          id: string; payroll_run_id: string; organization_id: string;
          trainer_id: string | null; appointment_id: string | null;
          compensation_rule_id: string | null; code: string; severity: string;
          entity_type: string | null; entity_id: string | null; message: string;
          suggested_action: string | null; resolution_status: string;
          resolution_reason: string | null; resolved_by: string | null;
          resolved_at: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          payroll_run_id: string; organization_id: string; code: string;
          severity: string; message: string;
        } & Partial<{
          id: string; trainer_id: string | null; appointment_id: string | null;
          compensation_rule_id: string | null; entity_type: string | null;
          entity_id: string | null; suggested_action: string | null;
          resolution_status: string;
        }>;
        Update: Partial<{
          resolution_status: string; resolution_reason: string | null;
          resolved_by: string | null; resolved_at: string | null;
        }>;
        Relationships: [];
      };
      manual_time_entries: {
        Row: {
          id: string; organization_id: string; trainer_id: string;
          reporting_period_id: string; work_date: string; work_category: string;
          description: string; requested_minutes: number;
          approved_minutes: number | null; compensation_purpose: string;
          status: string; submitted_by: string | null; submitted_at: string | null;
          approved_by: string | null; approved_at: string | null;
          rejected_by: string | null; rejected_at: string | null;
          rejection_reason: string | null; payroll_run_id: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          organization_id: string; trainer_id: string; reporting_period_id: string;
          work_date: string; work_category: string; description: string;
          requested_minutes: number;
        } & Partial<{
          id: string; approved_minutes: number | null; compensation_purpose: string;
          status: string; submitted_by: string | null; submitted_at: string | null;
        }>;
        Update: Partial<{
          work_date: string; work_category: string; description: string;
          requested_minutes: number; approved_minutes: number | null;
          compensation_purpose: string; status: string;
          submitted_by: string | null; submitted_at: string | null;
          approved_by: string | null; approved_at: string | null;
          rejected_by: string | null; rejected_at: string | null;
          rejection_reason: string | null; payroll_run_id: string | null;
        }>;
        Relationships: [];
      };
      payroll_adjustments: {
        Row: {
          id: string; organization_id: string; payroll_run_id: string | null;
          reporting_period_id: string; trainer_id: string; adjustment_type: string;
          amount_cents: number; reason: string; supporting_reference: string | null;
          status: string; requested_by: string | null; requested_at: string | null;
          approved_by: string | null; approved_at: string | null;
          rejected_by: string | null; rejected_at: string | null;
          rejection_reason: string | null; supersedes_adjustment_id: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          organization_id: string; reporting_period_id: string; trainer_id: string;
          adjustment_type: string; amount_cents: number; reason: string;
        } & Partial<{
          id: string; payroll_run_id: string | null;
          supporting_reference: string | null; status: string;
          requested_by: string | null; requested_at: string | null;
          supersedes_adjustment_id: string | null;
        }>;
        Update: Partial<{
          adjustment_type: string; amount_cents: number; reason: string;
          supporting_reference: string | null; status: string;
          approved_by: string | null; approved_at: string | null;
          rejected_by: string | null; rejected_at: string | null;
          rejection_reason: string | null; payroll_run_id: string | null;
        }>;
        Relationships: [];
      };
      payroll_snapshots: {
        Row: {
          id: string; payroll_run_id: string; organization_id: string;
          snapshot_version: number; kind: string; payload: Json;
          lines_sha256: string; created_by: string | null; created_at: string;
        };
        Insert: never; // created only via post_payroll_run RPC
        Update: never;
        Relationships: [];
      };
      payroll_exports: {
        Row: {
          id: string; payroll_run_id: string; organization_id: string;
          export_type: string; trainer_id: string | null;
          snapshot_version: number | null; generated_by: string | null;
          superseded: boolean; created_at: string;
        };
        Insert: {
          payroll_run_id: string; organization_id: string; export_type: string;
        } & Partial<{
          id: string; trainer_id: string | null; snapshot_version: number | null;
          generated_by: string | null;
        }>;
        Update: never;
        Relationships: [];
      };
      /* ------------------------------------------------------------------
       * Phase 6 tables (hand-maintained to match migration 18; compact form).
       * ---------------------------------------------------------------- */
      notifications: {
        Row: {
          id: string; recipient_id: string; organization_id: string | null;
          category: string; severity: string; title: string; body: string;
          link_path: string | null; entity_type: string | null;
          entity_id: string | null; actor_id: string | null;
          created_at: string; read_at: string | null; pinned_at: string | null;
          archived_at: string | null;
        };
        Insert: {
          recipient_id: string; category: string; title: string; actor_id: string;
        } & Partial<{
          id: string; organization_id: string | null; severity: string;
          body: string; link_path: string | null; entity_type: string | null;
          entity_id: string | null;
        }>;
        Update: Partial<{
          read_at: string | null; pinned_at: string | null;
          archived_at: string | null;
        }>;
        Relationships: [];
      };
      saved_views: {
        Row: {
          id: string; owner_id: string; kind: string; page: string;
          name: string; config: Json; pinned: boolean;
          organization_id: string | null; department_id: string | null;
          shared_scope: string; is_default: boolean;
          last_used_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          owner_id: string; kind: string; page: string; name: string;
        } & Partial<{
          id: string; config: Json; pinned: boolean;
          organization_id: string | null; department_id: string | null;
          shared_scope: string; is_default: boolean;
          last_used_at: string | null;
        }>;
        Update: Partial<{
          name: string; config: Json; pinned: boolean;
          organization_id: string | null; department_id: string | null;
          shared_scope: string; is_default: boolean;
          last_used_at: string | null;
        }>;
        Relationships: [];
      };
      export_events: {
        Row: {
          id: string; organization_id: string; export_type: string;
          source_page: string; format: string; engine_version: string | null;
          metadata: Json; generated_by: string | null; created_at: string;
        };
        Insert: {
          organization_id: string; export_type: string; source_page: string;
          generated_by: string;
        } & Partial<{
          id: string; format: string; engine_version: string | null;
          metadata: Json;
        }>;
        Update: never;
        Relationships: [];
      };
      /* ------------------------------------------------------------------
       * Phase 7 tables (hand-maintained to match migrations 19–20).
       * ---------------------------------------------------------------- */
      organization_close_policies: {
        Row: {
          organization_id: string; allow_self_approval: boolean;
          payroll_required_state: string; require_ack_note: boolean;
          created_at: string; updated_at: string;
        };
        Insert: { organization_id: string } & Partial<{
          allow_self_approval: boolean; payroll_required_state: string;
          require_ack_note: boolean;
        }>;
        Update: Partial<{
          allow_self_approval: boolean; payroll_required_state: string;
          require_ack_note: boolean;
        }>;
        Relationships: [];
      };
      period_close_runs: {
        Row: {
          id: string; organization_id: string; reporting_period_id: string;
          close_version: number; status: string;
          source_cutoff_at: string | null; readiness_snapshot: Json;
          blocking_issue_count: number; warning_count: number;
          initiated_by: string | null; initiated_at: string;
          reviewed_by: string | null; reviewed_at: string | null;
          approved_by: string | null; approved_at: string | null;
          closed_by: string | null; closed_at: string | null;
          reopened_by: string | null; reopened_at: string | null;
          reopen_reason: string | null; close_notes: string;
          report_package_id: string | null; manifest_sha256: string | null;
          supersedes_close_run_id: string | null;
          superseded_by_close_run_id: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          organization_id: string; reporting_period_id: string;
          initiated_by: string;
        } & Partial<{
          id: string; close_version: number; status: string;
          source_cutoff_at: string | null; close_notes: string;
          supersedes_close_run_id: string | null;
        }>;
        Update: Partial<{
          status: string; source_cutoff_at: string | null;
          readiness_snapshot: Json; blocking_issue_count: number;
          warning_count: number; reviewed_by: string | null;
          reviewed_at: string | null; approved_by: string | null;
          approved_at: string | null; close_notes: string;
          report_package_id: string | null;
        }>;
        Relationships: [];
      };
      period_close_events: {
        Row: {
          id: string; period_close_run_id: string; organization_id: string;
          from_status: string | null; to_status: string;
          actor_id: string | null; reason: string | null; created_at: string;
        };
        Insert: {
          period_close_run_id: string; organization_id: string;
          to_status: string;
        } & Partial<{
          id: string; from_status: string | null; actor_id: string | null;
          reason: string | null;
        }>;
        Update: never;
        Relationships: [];
      };
      period_close_acknowledgements: {
        Row: {
          id: string; period_close_run_id: string; organization_id: string;
          check_code: string; close_version: number; note: string;
          acknowledged_by: string | null; created_at: string;
        };
        Insert: {
          period_close_run_id: string; organization_id: string;
          check_code: string; close_version: number; acknowledged_by: string;
        } & Partial<{ id: string; note: string }>;
        Update: never;
        Relationships: [];
      };
      report_packages: {
        Row: {
          id: string; organization_id: string; reporting_period_id: string;
          period_close_run_id: string | null; package_type: string;
          department_id: string | null; version: number; status: string;
          generated_by: string | null; generated_at: string;
          intelligence_version: string | null; payroll_run_id: string | null;
          payroll_snapshot_version: number | null; filters: Json;
          payload: Json; warnings: Json; package_sha256: string | null;
          failure_reason: string | null;
          supersedes_package_id: string | null;
          superseded_by_package_id: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          organization_id: string; reporting_period_id: string;
          package_type: string; generated_by: string;
        } & Partial<{
          id: string; department_id: string | null; version: number;
          status: string; intelligence_version: string | null;
          payroll_run_id: string | null;
          payroll_snapshot_version: number | null; filters: Json;
          payload: Json; warnings: Json; package_sha256: string | null;
          supersedes_package_id: string | null;
        }>;
        Update: Partial<{
          status: string; payload: Json; warnings: Json;
          package_sha256: string | null; failure_reason: string | null;
          superseded_by_package_id: string | null;
          period_close_run_id: string | null;
        }>;
        Relationships: [];
      };
      close_exports: {
        Row: {
          id: string; organization_id: string; reporting_period_id: string;
          period_close_run_id: string | null; report_package_id: string | null;
          export_type: string; file_name: string; mime_type: string;
          version: number; byte_size: number; sha256: string;
          row_count: number; filters: Json; payroll_run_id: string | null;
          payroll_snapshot_version: number | null;
          generated_by: string | null; superseded: boolean;
          download_count: number; created_at: string;
        };
        Insert: {
          organization_id: string; reporting_period_id: string;
          export_type: string; file_name: string; sha256: string;
          generated_by: string;
        } & Partial<{
          id: string; period_close_run_id: string | null;
          report_package_id: string | null; mime_type: string;
          version: number; byte_size: number; row_count: number;
          filters: Json; payroll_run_id: string | null;
          payroll_snapshot_version: number | null;
        }>;
        Update: Partial<{ superseded: boolean; download_count: number }>;
        Relationships: [];
      };
      period_close_manifests: {
        Row: {
          id: string; period_close_run_id: string; organization_id: string;
          payload: Json; manifest_sha256: string; created_by: string | null;
          created_at: string;
        };
        Insert: never; // created only via execute_period_close RPC
        Update: never;
        Relationships: [];
      };
      scheduled_report_definitions: {
        Row: {
          id: string; organization_id: string; department_id: string | null;
          owner_id: string; saved_view_id: string | null; report_type: string;
          frequency: string; delivery_channel: string; recipients: Json;
          timezone: string; active: boolean; execution_enabled: boolean;
          next_intended_run: string | null; last_intended_run: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          organization_id: string; owner_id: string; report_type: string;
          frequency: string;
        } & Partial<{
          id: string; department_id: string | null;
          saved_view_id: string | null; delivery_channel: string;
          recipients: Json; timezone: string; active: boolean;
          next_intended_run: string | null;
        }>;
        Update: Partial<{
          department_id: string | null; saved_view_id: string | null;
          report_type: string; frequency: string; delivery_channel: string;
          recipients: Json; timezone: string; active: boolean;
          next_intended_run: string | null; last_intended_run: string | null;
        }>;
        Relationships: [];
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
      post_import_batch: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      reverse_import_batch: {
        Args: { p_batch_id: string; p_reason: string };
        Returns: Json;
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
      post_payroll_run: {
        Args: { p_run_id: string };
        Returns: Json;
      };
      lock_payroll_run: {
        Args: { p_run_id: string; p_reason: string };
        Returns: undefined;
      };
      reopen_payroll_run: {
        Args: { p_run_id: string; p_reason: string };
        Returns: undefined;
      };
      void_payroll_run: {
        Args: { p_run_id: string; p_reason: string };
        Returns: undefined;
      };
      supersede_payroll_run: {
        Args: { p_run_id: string; p_reason: string };
        Returns: string;
      };
      payroll_dependencies_for_batch: {
        Args: { p_batch_id: string };
        Returns: {
          payroll_run_id: string;
          run_name: string;
          run_status: string;
        }[];
      };
      execute_period_close: {
        Args: { p_run_id: string; p_manifest: Json; p_manifest_sha256: string };
        Returns: Json;
      };
      reopen_period_close: {
        Args: { p_run_id: string; p_reason: string };
        Returns: string;
      };
      void_period_close: {
        Args: { p_run_id: string; p_reason: string };
        Returns: undefined;
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
