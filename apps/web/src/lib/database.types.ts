export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      absence_types: {
        Row: {
          archived_at: string | null
          border_color: string
          color: string
          created_at: string | null
          created_by: string | null
          id: number
          label: string
          name: string
          org_id: string
          sort_order: number
          text_color: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          border_color?: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          id?: never
          label: string
          name: string
          org_id: string
          sort_order?: number
          text_color?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          border_color?: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          id?: never
          label?: string
          name?: string
          org_id?: string
          sort_order?: number
          text_color?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "absence_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          impersonation_session_id: string | null
          ip_address: unknown
          org_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          impersonation_session_id?: string | null
          ip_address?: unknown
          org_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          impersonation_session_id?: string | null
          ip_address?: unknown
          org_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      certifications: {
        Row: {
          abbr: string
          archived_at: string | null
          department_id: number | null
          id: number
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          abbr: string
          archived_at?: string | null
          department_id?: number | null
          id?: never
          name: string
          org_id: string
          sort_order?: number
        }
        Update: {
          abbr?: string
          archived_at?: string | null
          department_id?: number | null
          id?: never
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "certifications_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cookie_consents: {
        Row: {
          consent: Json
          consent_version: string | null
          created_at: string
          id: number
          ip_hash: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consent?: Json
          consent_version?: string | null
          created_at?: string
          id?: never
          ip_hash: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consent?: Json
          consent_version?: string | null
          created_at?: string
          id?: never
          ip_hash?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      coverage_requirements: {
        Row: {
          created_at: string | null
          created_by: string | null
          day_of_week: number | null
          focus_area_id: number
          id: number
          job_id: number
          min_staff: number
          org_id: string
          preferred_shift_id: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number | null
          focus_area_id: number
          id?: never
          job_id: number
          min_staff?: number
          org_id: string
          preferred_shift_id?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          day_of_week?: number | null
          focus_area_id?: number
          id?: never
          job_id?: number
          min_staff?: number
          org_id?: string
          preferred_shift_id?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coverage_requirements_focus_area_id_fkey"
            columns: ["focus_area_id"]
            isOneToOne: false
            referencedRelation: "focus_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_requirements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_requirements_preferred_shift_id_fkey"
            columns: ["preferred_shift_id"]
            isOneToOne: false
            referencedRelation: "shift_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          abbr: string
          archived_at: string | null
          id: number
          name: string
          org_id: string
          permissions: Json | null
          sort_order: number
          type: Database["public"]["Enums"]["department_type"]
        }
        Insert: {
          abbr?: string
          archived_at?: string | null
          id?: never
          name: string
          org_id: string
          permissions?: Json | null
          sort_order?: number
          type?: Database["public"]["Enums"]["department_type"]
        }
        Update: {
          abbr?: string
          archived_at?: string | null
          id?: never
          name?: string
          org_id?: string
          permissions?: Json | null
          sort_order?: number
          type?: Database["public"]["Enums"]["department_type"]
        }
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          archived_at: string | null
          certification_id: number | null
          contact_notes: string
          created_at: string | null
          created_by: string | null
          department_ids: number[]
          dept_admin_ids: number[]
          email: string
          employment_type: Database["public"]["Enums"]["employee_employment_type"]
          first_name: string
          focus_area_ids: number[]
          id: string
          last_name: string
          org_id: string
          phone: string
          role_ids: number[]
          seniority: number
          status: Database["public"]["Enums"]["employee_status"]
          status_changed_at: string | null
          status_note: string
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          version: number
        }
        Insert: {
          archived_at?: string | null
          certification_id?: number | null
          contact_notes?: string
          created_at?: string | null
          created_by?: string | null
          department_ids?: number[]
          dept_admin_ids?: number[]
          email?: string
          employment_type?: Database["public"]["Enums"]["employee_employment_type"]
          first_name: string
          focus_area_ids?: number[]
          id?: string
          last_name: string
          org_id: string
          phone?: string
          role_ids?: number[]
          seniority: number
          status?: Database["public"]["Enums"]["employee_status"]
          status_changed_at?: string | null
          status_note?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          version?: number
        }
        Update: {
          archived_at?: string | null
          certification_id?: number | null
          contact_notes?: string
          created_at?: string | null
          created_by?: string | null
          department_ids?: number[]
          dept_admin_ids?: number[]
          email?: string
          employment_type?: Database["public"]["Enums"]["employee_employment_type"]
          first_name?: string
          focus_area_ids?: number[]
          id?: string
          last_name?: string
          org_id?: string
          phone?: string
          role_ids?: number[]
          seniority?: number
          status?: Database["public"]["Enums"]["employee_status"]
          status_changed_at?: string | null
          status_note?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_areas: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string | null
          created_by: string | null
          department_id: number | null
          id: number
          name: string
          org_id: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string | null
          created_by?: string | null
          department_id?: number | null
          id?: never
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string | null
          created_by?: string | null
          department_id?: number | null
          id?: never
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "focus_areas_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focus_areas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          created_at: string
          end_reason: string | null
          ended_at: string | null
          expires_at: string
          gridmaster_id: string
          ip_address: unknown
          justification: string
          session_id: string
          target_org_id: string
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          gridmaster_id: string
          ip_address?: unknown
          justification?: string
          session_id?: string
          target_org_id: string
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          gridmaster_id?: string
          ip_address?: unknown
          justification?: string
          session_id?: string
          target_org_id?: string
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      indicator_types: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          created_by: string | null
          id: number
          name: string
          org_id: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          id?: never
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          id?: never
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indicator_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          department_ids: number[]
          dept_admin_ids: number[]
          email: string
          employee_id: string | null
          expires_at: string
          first_name: string | null
          id: string
          invited_by: string | null
          last_name: string | null
          org_id: string
          phone: string | null
          revoked_at: string | null
          role_to_assign: Database["public"]["Enums"]["org_role"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          department_ids?: number[]
          dept_admin_ids?: number[]
          email: string
          employee_id?: string | null
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          org_id: string
          phone?: string | null
          revoked_at?: string | null
          role_to_assign?: Database["public"]["Enums"]["org_role"]
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          department_ids?: number[]
          dept_admin_ids?: number[]
          email?: string
          employee_id?: string | null
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          org_id?: string
          phone?: string | null
          revoked_at?: string | null
          role_to_assign?: Database["public"]["Enums"]["org_role"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          abbr: string
          applicable_shift_ids: number[]
          archived_at: string | null
          assignment_mode: string
          border_color: string
          color: string
          created_at: string | null
          created_by: string | null
          default_duration_hours: number | null
          default_duration_minutes: number | null
          default_end_time: string | null
          default_start_time: string | null
          department_ids: number[]
          eligibility_mode: string
          eligible_role_ids: number[]
          focus_area_ids: number[]
          id: number
          name: string
          org_id: string
          required_certification_ids: number[]
          shift_color_overrides: Json
          shift_time_overrides: Json
          show_on_grid: boolean
          sort_order: number
          system_key: string | null
          text_color: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          abbr: string
          applicable_shift_ids?: number[]
          archived_at?: string | null
          assignment_mode?: string
          border_color?: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          default_duration_hours?: number | null
          default_duration_minutes?: number | null
          default_end_time?: string | null
          default_start_time?: string | null
          department_ids?: number[]
          eligibility_mode?: string
          eligible_role_ids?: number[]
          focus_area_ids?: number[]
          id?: never
          name: string
          org_id: string
          required_certification_ids?: number[]
          shift_color_overrides?: Json
          shift_time_overrides?: Json
          show_on_grid?: boolean
          sort_order?: number
          system_key?: string | null
          text_color?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          abbr?: string
          applicable_shift_ids?: number[]
          archived_at?: string | null
          assignment_mode?: string
          border_color?: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          default_duration_hours?: number | null
          default_duration_minutes?: number | null
          default_end_time?: string | null
          default_start_time?: string | null
          department_ids?: number[]
          eligibility_mode?: string
          eligible_role_ids?: number[]
          focus_area_ids?: number[]
          id?: never
          name?: string
          org_id?: string
          required_certification_ids?: number[]
          shift_color_overrides?: Json
          shift_time_overrides?: Json
          show_on_grid?: boolean
          sort_order?: number
          system_key?: string | null
          text_color?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jwt_refresh_locks: {
        Row: {
          locked_until: string
          reason: string | null
          user_id: string
        }
        Insert: {
          locked_until: string
          reason?: string | null
          user_id: string
        }
        Update: {
          locked_until?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mobile_device_tokens: {
        Row: {
          created_at: string
          disabled_at: string | null
          expo_push_token: string
          id: string
          last_seen_at: string
          org_id: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          expo_push_token: string
          id?: string
          last_seen_at?: string
          org_id: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          org_id?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_device_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: number
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category: string | null
          channel: string
          created_at: string
          id: string
          message: string
          metadata: Json | null
          org_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          category?: string | null
          channel?: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          org_id?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          category?: string | null
          channel?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          org_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          admin_permissions: Json | null
          archived_at: string | null
          archived_by: string | null
          department_ids: number[]
          dept_admin_ids: number[]
          id: number
          joined_at: string
          onboarding_completed_at: string | null
          org_id: string
          org_role: Database["public"]["Enums"]["org_role"]
          phone: string | null
          schedule_last_viewed_at: string | null
          tooltip_tours_completed: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_permissions?: Json | null
          archived_at?: string | null
          archived_by?: string | null
          department_ids?: number[]
          dept_admin_ids?: number[]
          id?: never
          joined_at?: string
          onboarding_completed_at?: string | null
          org_id: string
          org_role?: Database["public"]["Enums"]["org_role"]
          phone?: string | null
          schedule_last_viewed_at?: string | null
          tooltip_tours_completed?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_permissions?: Json | null
          archived_at?: string | null
          archived_by?: string | null
          department_ids?: number[]
          dept_admin_ids?: number[]
          id?: never
          joined_at?: string
          onboarding_completed_at?: string | null
          org_id?: string
          org_role?: Database["public"]["Enums"]["org_role"]
          phone?: string | null
          schedule_last_viewed_at?: string | null
          tooltip_tours_completed?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_roles: {
        Row: {
          abbr: string
          archived_at: string | null
          department_id: number | null
          id: number
          is_schedule_role: boolean
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          abbr: string
          archived_at?: string | null
          department_id?: number | null
          id?: never
          is_schedule_role?: boolean
          name: string
          org_id: string
          sort_order?: number
        }
        Update: {
          abbr?: string
          archived_at?: string | null
          department_id?: number | null
          id?: never
          is_schedule_role?: boolean
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string
          address_city: string
          address_country: string
          address_line_1: string
          address_line_2: string
          address_postal_code: string
          address_state: string
          app_name: string | null
          archived_at: string | null
          certification_label: string | null
          coverage_rule_config: Json
          created_at: string | null
          created_by: string | null
          data_retention_days: number
          department_label: string | null
          employee_count: number | null
          enforce_conflict_prevention: boolean
          feature_overrides: Json
          focus_area_label: string | null
          id: string
          landing_page_config: Json | null
          logo_url: string | null
          meta_description: string | null
          name: string
          pay_period_start_date: string | null
          phone: string
          role_label: string | null
          shift_display_mode: string | null
          slug: string | null
          stripe_customer_id: string | null
          subscription_seats: number | null
          subscription_status: string
          suspended_at: string | null
          suspended_reason: string | null
          theme_config: Json | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address?: string
          address_city?: string
          address_country?: string
          address_line_1?: string
          address_line_2?: string
          address_postal_code?: string
          address_state?: string
          app_name?: string | null
          archived_at?: string | null
          certification_label?: string | null
          coverage_rule_config?: Json
          created_at?: string | null
          created_by?: string | null
          data_retention_days?: number
          department_label?: string | null
          employee_count?: number | null
          enforce_conflict_prevention?: boolean
          feature_overrides?: Json
          focus_area_label?: string | null
          id?: string
          landing_page_config?: Json | null
          logo_url?: string | null
          meta_description?: string | null
          name?: string
          pay_period_start_date?: string | null
          phone?: string
          role_label?: string | null
          shift_display_mode?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
          subscription_seats?: number | null
          subscription_status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          theme_config?: Json | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address?: string
          address_city?: string
          address_country?: string
          address_line_1?: string
          address_line_2?: string
          address_postal_code?: string
          address_state?: string
          app_name?: string | null
          archived_at?: string | null
          certification_label?: string | null
          coverage_rule_config?: Json
          created_at?: string | null
          created_by?: string | null
          data_retention_days?: number
          department_label?: string | null
          employee_count?: number | null
          enforce_conflict_prevention?: boolean
          feature_overrides?: Json
          focus_area_label?: string | null
          id?: string
          landing_page_config?: Json | null
          logo_url?: string | null
          meta_description?: string | null
          name?: string
          pay_period_start_date?: string | null
          phone?: string
          role_label?: string | null
          shift_display_mode?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
          subscription_seats?: number | null
          subscription_status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          theme_config?: Json | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      profile_change_requests: {
        Row: {
          cancelled_at: string | null
          created_at: string
          current_values: Json
          id: string
          org_id: string
          request_note: string
          request_type: Database["public"]["Enums"]["profile_change_request_type"]
          requested_changes: Json
          requester_email: string | null
          requester_employee_id: string | null
          requester_employee_version: number | null
          requester_name: string
          requester_user_id: string | null
          resolved_at: string | null
          resolver_note: string
          resolver_user_id: string | null
          status: Database["public"]["Enums"]["profile_change_request_status"]
          updated_at: string
          version: number
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          current_values?: Json
          id?: string
          org_id: string
          request_note?: string
          request_type: Database["public"]["Enums"]["profile_change_request_type"]
          requested_changes?: Json
          requester_email?: string | null
          requester_employee_id?: string | null
          requester_employee_version?: number | null
          requester_name?: string
          requester_user_id?: string | null
          resolved_at?: string | null
          resolver_note?: string
          resolver_user_id?: string | null
          status?: Database["public"]["Enums"]["profile_change_request_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          current_values?: Json
          id?: string
          org_id?: string
          request_note?: string
          request_type?: Database["public"]["Enums"]["profile_change_request_type"]
          requested_changes?: Json
          requester_email?: string | null
          requester_employee_id?: string | null
          requester_employee_version?: number | null
          requester_name?: string
          requester_user_id?: string | null
          resolved_at?: string | null
          resolver_note?: string
          resolver_user_id?: string | null
          status?: Database["public"]["Enums"]["profile_change_request_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_change_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_requests_requester_employee_id_fkey"
            columns: ["requester_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_warned_at: string | null
          first_name: string | null
          id: string
          last_name: string | null
          last_sign_in_at: string | null
          mfa_enabled: boolean
          org_id: string | null
          platform_role: Database["public"]["Enums"]["platform_role"]
          role_locked: boolean
          scheduled_deletion_at: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_warned_at?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          last_sign_in_at?: string | null
          mfa_enabled?: boolean
          org_id?: string | null
          platform_role?: Database["public"]["Enums"]["platform_role"]
          role_locked?: boolean
          scheduled_deletion_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string | null
          version?: number
        }
        Update: {
          created_at?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_warned_at?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_sign_in_at?: string | null
          mfa_enabled?: boolean
          org_id?: string | null
          platform_role?: Database["public"]["Enums"]["platform_role"]
          role_locked?: boolean
          scheduled_deletion_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_history: {
        Row: {
          change_count: number
          changes: Json
          end_date: string
          id: string
          org_id: string
          published_at: string
          published_by: string
          start_date: string
        }
        Insert: {
          change_count?: number
          changes?: Json
          end_date: string
          id?: string
          org_id: string
          published_at?: string
          published_by: string
          start_date: string
        }
        Update: {
          change_count?: number
          changes?: Json
          end_date?: string
          id?: string
          org_id?: string
          published_at?: string
          published_by?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_history_org_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_shifts: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          day_of_week: number
          effective_from: string
          effective_until: string | null
          emp_id: string
          id: string
          org_id: string
          state: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week: number
          effective_from?: string
          effective_until?: string | null
          emp_id: string
          id?: string
          org_id: string
          state: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          effective_from?: string
          effective_until?: string | null
          emp_id?: string
          id?: string
          org_id?: string
          state?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_shifts_emp_id_fkey"
            columns: ["emp_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_shifts_draft_sessions: {
        Row: {
          draft_data: Json
          id: string
          org_id: string
          saved_at: string
          saved_by: string
        }
        Insert: {
          draft_data?: Json
          id?: string
          org_id: string
          saved_at?: string
          saved_by: string
        }
        Update: {
          draft_data?: Json
          id?: string
          org_id?: string
          saved_at?: string
          saved_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_shifts_draft_org_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_change_log: {
        Row: {
          change_type: string
          changed_by_id: string | null
          created_at: string
          from_role: string
          id: string
          idempotency_key: string
          permissions_after: Json | null
          permissions_before: Json | null
          target_user_id: string
          to_role: string
        }
        Insert: {
          change_type?: string
          changed_by_id?: string | null
          created_at?: string
          from_role: string
          id?: string
          idempotency_key: string
          permissions_after?: Json | null
          permissions_before?: Json | null
          target_user_id: string
          to_role: string
        }
        Update: {
          change_type?: string
          changed_by_id?: string | null
          created_at?: string
          from_role?: string
          id?: string
          idempotency_key?: string
          permissions_after?: Json | null
          permissions_before?: Json | null
          target_user_id?: string
          to_role?: string
        }
        Relationships: []
      }
      schedule_cell_segments: {
        Row: {
          created_at: string
          id: string
          is_mentored: boolean
          job_id: number
          org_id: string
          position: number
          shift_id: number | null
          snapshot_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_mentored?: boolean
          job_id: number
          org_id: string
          position: number
          shift_id?: number | null
          snapshot_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_mentored?: boolean
          job_id?: number
          org_id?: string
          position?: number
          shift_id?: number | null
          snapshot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_cell_segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_cell_segments_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "schedule_cell_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_cell_snapshots: {
        Row: {
          absence_type_id: number | null
          cell_id: string
          created_at: string
          custom_end_time: string | null
          custom_start_time: string | null
          id: string
          org_id: string
          snapshot_kind: string
          state_kind: string
          updated_at: string
        }
        Insert: {
          absence_type_id?: number | null
          cell_id: string
          created_at?: string
          custom_end_time?: string | null
          custom_start_time?: string | null
          id?: string
          org_id: string
          snapshot_kind: string
          state_kind: string
          updated_at?: string
        }
        Update: {
          absence_type_id?: number | null
          cell_id?: string
          created_at?: string
          custom_end_time?: string | null
          custom_start_time?: string | null
          id?: string
          org_id?: string
          snapshot_kind?: string
          state_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_cell_snapshots_absence_type_id_fkey"
            columns: ["absence_type_id"]
            isOneToOne: false
            referencedRelation: "absence_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_cell_snapshots_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "schedule_cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_cell_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_cells: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          emp_id: string
          focus_area_id: number | null
          from_recurring: boolean
          id: string
          org_id: string
          series_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          emp_id: string
          focus_area_id?: number | null
          from_recurring?: boolean
          id?: string
          org_id: string
          series_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          emp_id?: string
          focus_area_id?: number | null
          from_recurring?: boolean
          id?: string
          org_id?: string
          series_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_cells_emp_id_fkey"
            columns: ["emp_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_cells_focus_area_id_fkey"
            columns: ["focus_area_id"]
            isOneToOne: false
            referencedRelation: "focus_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_cells_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_cells_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "shift_series"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_draft_sessions: {
        Row: {
          end_date: string
          id: string
          org_id: string
          saved_at: string
          saved_by: string
          start_date: string
        }
        Insert: {
          end_date: string
          id?: string
          org_id: string
          saved_at?: string
          saved_by: string
          start_date: string
        }
        Update: {
          end_date?: string
          id?: string
          org_id?: string
          saved_at?: string
          saved_by?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_draft_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          emp_id: string
          focus_area_id: number | null
          id: number
          indicator_type_id: number
          org_id: string
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          emp_id: string
          focus_area_id?: number | null
          id?: never
          indicator_type_id: number
          org_id: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          emp_id?: string
          focus_area_id?: number | null
          id?: never
          indicator_type_id?: number
          org_id?: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_notes_emp_id_fkey"
            columns: ["emp_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_notes_focus_area_id_fkey"
            columns: ["focus_area_id"]
            isOneToOne: false
            referencedRelation: "focus_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_notes_indicator_type_id_fkey"
            columns: ["indicator_type_id"]
            isOneToOne: false
            referencedRelation: "indicator_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_categories: {
        Row: {
          abbr: string | null
          archived_at: string | null
          break_minutes: number | null
          color: string
          end_time: string | null
          focus_area_id: number | null
          id: number
          name: string
          org_id: string
          sort_order: number
          start_time: string | null
        }
        Insert: {
          abbr?: string | null
          archived_at?: string | null
          break_minutes?: number | null
          color?: string
          end_time?: string | null
          focus_area_id?: number | null
          id?: never
          name: string
          org_id: string
          sort_order?: number
          start_time?: string | null
        }
        Update: {
          abbr?: string | null
          archived_at?: string | null
          break_minutes?: number | null
          color?: string
          end_time?: string | null
          focus_area_id?: number | null
          id?: never
          name?: string
          org_id?: string
          sort_order?: number
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_categories_focus_area_id_fkey"
            columns: ["focus_area_id"]
            isOneToOne: false
            referencedRelation: "focus_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_requests: {
        Row: {
          absence_type_id: number | null
          admin_note: string | null
          admin_user_id: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          org_id: string
          parent_request_id: string | null
          requester_emp_id: string
          requester_shift_date: string
          requester_state: Json
          resolved_at: string | null
          status: Database["public"]["Enums"]["shift_request_status"]
          target_emp_id: string | null
          target_shift_date: string | null
          target_state: Json | null
          type: Database["public"]["Enums"]["shift_request_type"]
          updated_at: string
        }
        Insert: {
          absence_type_id?: number | null
          admin_note?: string | null
          admin_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          org_id: string
          parent_request_id?: string | null
          requester_emp_id: string
          requester_shift_date: string
          requester_state: Json
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["shift_request_status"]
          target_emp_id?: string | null
          target_shift_date?: string | null
          target_state?: Json | null
          type: Database["public"]["Enums"]["shift_request_type"]
          updated_at?: string
        }
        Update: {
          absence_type_id?: number | null
          admin_note?: string | null
          admin_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          org_id?: string
          parent_request_id?: string | null
          requester_emp_id?: string
          requester_shift_date?: string
          requester_state?: Json
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["shift_request_status"]
          target_emp_id?: string | null
          target_shift_date?: string | null
          target_state?: Json | null
          type?: Database["public"]["Enums"]["shift_request_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_requests_absence_type_id_fkey"
            columns: ["absence_type_id"]
            isOneToOne: false
            referencedRelation: "absence_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_parent_request_id_fkey"
            columns: ["parent_request_id"]
            isOneToOne: false
            referencedRelation: "shift_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_requester_emp_id_fkey"
            columns: ["requester_emp_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_target_emp_id_fkey"
            columns: ["target_emp_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_series: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          days_of_week: number[] | null
          emp_id: string
          end_date: string | null
          frequency: Database["public"]["Enums"]["shift_series_frequency"]
          id: string
          max_occurrences: number | null
          org_id: string
          start_date: string
          state: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          days_of_week?: number[] | null
          emp_id: string
          end_date?: string | null
          frequency: Database["public"]["Enums"]["shift_series_frequency"]
          id?: string
          max_occurrences?: number | null
          org_id: string
          start_date: string
          state: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          days_of_week?: number[] | null
          emp_id?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["shift_series_frequency"]
          id?: string
          max_occurrences?: number | null
          org_id?: string
          start_date?: string
          state?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_series_emp_id_fkey"
            columns: ["emp_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_series_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: number
          org_id: string
          price_id: string | null
          quantity: number
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: never
          org_id: string
          price_id?: string | null
          quantity?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: never
          org_id?: string
          price_id?: string | null
          quantity?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_acceptances: {
        Row: {
          accepted_at: string
          id: number
          ip_address: unknown
          terms_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: never
          ip_address?: unknown
          terms_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: never
          ip_address?: unknown
          terms_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          active_org_id: string | null
          app_version: string | null
          created_at: string
          device_label: string | null
          id: string
          ip_address: unknown
          last_active_at: string
          org_id: string | null
          platform: string | null
          refresh_token_hash: string | null
          supabase_session_id: string | null
          user_id: string
        }
        Insert: {
          active_org_id?: string | null
          app_version?: string | null
          created_at?: string
          device_label?: string | null
          id?: string
          ip_address?: unknown
          last_active_at?: string
          org_id?: string | null
          platform?: string | null
          refresh_token_hash?: string | null
          supabase_session_id?: string | null
          user_id: string
        }
        Update: {
          active_org_id?: string | null
          app_version?: string | null
          created_at?: string
          device_label?: string | null
          id?: string
          ip_address?: unknown
          last_active_at?: string
          org_id?: string | null
          platform?: string | null
          refresh_token_hash?: string | null
          supabase_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      apply_recurring_schedules: {
        Args: { p_end_date: string; p_org_id: string; p_start_date: string }
        Returns: Json
      }
      assert_non_overlapping_work_assignment_times: {
        Args: {
          p_custom_end?: string
          p_custom_start?: string
          p_job_ids: number[]
          p_shift_ids: number[]
        }
        Returns: undefined
      }
      assign_gridmaster_by_email: {
        Args: { p_email: string }
        Returns: undefined
      }
      assign_org_role_by_email: {
        Args: {
          p_email: string
          p_org_id: string
          p_org_role?: Database["public"]["Enums"]["org_role"]
        }
        Returns: undefined
      }
      build_schedule_cell_state_json: {
        Args: {
          p_absence_type_id?: number
          p_custom_end_time?: string
          p_custom_start_time?: string
          p_from_recurring?: boolean
          p_is_mentored_flags?: boolean[]
          p_job_ids?: number[]
          p_series_id?: string
          p_shift_ids?: number[]
          p_state_kind: string
        }
        Returns: Json
      }
      caller_org_id: { Args: never; Returns: string }
      caller_org_role: {
        Args: never
        Returns: Database["public"]["Enums"]["org_role"]
      }
      cancel_shift_request: {
        Args: { p_emp_id: string; p_request_id: string }
        Returns: undefined
      }
      change_user_role: {
        Args: {
          p_changed_by_id: string
          p_expected_updated_at?: string
          p_idempotency_key: string
          p_new_role: string
          p_org_id?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      check_admin_permission: {
        Args: { p_permission: string }
        Returns: boolean
      }
      claim_shift_request: {
        Args: { p_claimer_emp_id: string; p_request_id: string }
        Returns: undefined
      }
      complete_onboarding: { Args: { p_org_id: string }; Returns: undefined }
      complete_tooltip_tour: {
        Args: { p_org_id: string; p_page_key: string }
        Returns: undefined
      }
      count_active_draft_sessions: { Args: never; Returns: number }
      create_shift_request: {
        Args: {
          p_absence_type_id?: number
          p_idempotency_key?: string
          p_org_id: string
          p_requester_emp_id: string
          p_requester_segment_index?: number
          p_requester_shift_date: string
          p_target_emp_id?: string
          p_target_segment_index?: number
          p_target_shift_date?: string
          p_type: Database["public"]["Enums"]["shift_request_type"]
        }
        Returns: string
      }
      create_shift_series: {
        Args: {
          p_days_of_week?: number[]
          p_emp_id: string
          p_end_date?: string
          p_frequency: Database["public"]["Enums"]["shift_series_frequency"]
          p_max_occurrences?: number
          p_org_id: string
          p_series_id: string
          p_start_date?: string
          p_state: Json
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      delete_schedule_cell_draft: {
        Args: {
          p_date: string
          p_emp_id: string
          p_expected_version?: number
          p_org_id: string
        }
        Returns: number
      }
      delete_shift_series: {
        Args: { p_org_id: string; p_series_id: string }
        Returns: number
      }
      end_impersonation: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: undefined
      }
      expire_shift_requests: { Args: never; Returns: number }
      find_matching_schedule_segment_ordinal: {
        Args: {
          p_custom_end: string
          p_custom_start: string
          p_is_mentored_flags: boolean[]
          p_job_ids: number[]
          p_match_custom_end: string
          p_match_custom_start: string
          p_match_is_mentored: boolean
          p_match_job_id: number
          p_match_shift_id: number
          p_shift_ids: number[]
        }
        Returns: number
      }
      flag_inactive_accounts: {
        Args: { retention_days?: number }
        Returns: Json
      }
      force_logout_user: {
        Args: { p_target_user_id: string }
        Returns: undefined
      }
      gdpr_erase_user_data: { Args: { p_user_id: string }; Returns: Json }
      generate_org_slug: { Args: { p_name: string }; Returns: string }
      get_all_users_with_profiles: {
        Args: never
        Returns: {
          created_at: string
          deactivated_at: string
          email: string
          id: string
          last_sign_in_at: string
          org_id: string
          org_name: string
          org_role: Database["public"]["Enums"]["org_role"]
          org_slug: string
          platform_role: Database["public"]["Enums"]["platform_role"]
        }[]
      }
      get_audit_log: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_org_id?: string
          p_target_user_id?: string
        }
        Returns: {
          changed_by_email: string
          changed_by_id: string
          created_at: string
          from_role: string
          id: string
          org_id: string
          org_name: string
          target_email: string
          target_user_id: string
          to_role: string
        }[]
      }
      get_impersonation_history: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          created_at: string
          end_reason: string
          ended_at: string
          expires_at: string
          gridmaster_email: string
          gridmaster_id: string
          ip_address: unknown
          justification: string
          session_id: string
          target_email: string
          target_org_id: string
          target_org_name: string
          target_user_id: string
          user_agent: string
        }[]
      }
      get_my_organizations: {
        Args: never
        Returns: {
          is_active: boolean
          org_id: string
          org_name: string
          org_role: Database["public"]["Enums"]["org_role"]
          org_slug: string
        }[]
      }
      get_notifications: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          category: string
          channel: string
          created_at: string
          id: string
          message: string
          metadata: Json
          read_at: string
          title: string
          type: string
        }[]
      }
      get_org_directory: {
        Args: { p_org_id: string }
        Returns: {
          certification_id: number
          email: string
          employee_id: string
          employee_status: string
          first_name: string
          focus_area_ids: number[]
          has_app_access: boolean
          invitation_status: string
          last_name: string
          last_sign_in_at: string
          management_department_ids: number[]
          management_dept_admin_ids: number[]
          org_role: string
          person_id: string
          phone: string
          role_ids: number[]
          scheduled_department_ids: number[]
          scheduled_dept_admin_ids: number[]
          seniority: number
          source: string
          user_id: string
        }[]
      }
      get_org_users: {
        Args: { p_org_id: string }
        Returns: {
          admin_permissions: Json
          created_at: string
          department_ids: number[]
          dept_admin_ids: number[]
          email: string
          first_name: string
          id: string
          last_name: string
          last_sign_in_at: string
          org_role: Database["public"]["Enums"]["org_role"]
          platform_role: Database["public"]["Enums"]["platform_role"]
          updated_at: string
        }[]
      }
      get_publish_history: {
        Args: { p_limit?: number; p_offset?: number; p_org_id: string }
        Returns: {
          change_count: number
          changes: Json
          end_date: string
          id: string
          published_at: string
          published_by: string
          published_by_name: string
          start_date: string
        }[]
      }
      get_schedule_cell_snapshot_payload: {
        Args: {
          p_date: string
          p_emp_id: string
          p_org_id: string
          p_snapshot_kind: string
        }
        Returns: {
          absence_type_id: number
          cell_id: string
          custom_end_time: string
          custom_start_time: string
          date: string
          emp_id: string
          focus_area_id: number
          from_recurring: boolean
          is_mentored_flags: boolean[]
          job_ids: number[]
          org_id: string
          series_id: string
          shift_ids: number[]
          state_kind: string
          version: number
        }[]
      }
      get_schedule_last_viewed: { Args: { p_org_id: string }; Returns: string }
      get_system_stats: { Args: never; Returns: Json }
      get_tenant_stats: {
        Args: never
        Returns: {
          employee_count: number
          org_id: string
          user_count: number
        }[]
      }
      get_unread_notification_count: { Args: never; Returns: number }
      has_work_assignment_started: {
        Args: {
          p_custom_end: string
          p_custom_start: string
          p_job_ids: number[]
          p_org_id: string
          p_shift_date: string
          p_shift_ids: number[]
        }
        Returns: boolean
      }
      is_gridmaster: { Args: never; Returns: boolean }
      link_employee_to_user: {
        Args: { p_employee_id: string; p_org_id: string; p_user_id: string }
        Returns: Json
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      move_shift: {
        Args: {
          p_absence_type_id?: number
          p_custom_end_time?: string
          p_custom_start_time?: string
          p_drag_mode?: string
          p_expected_version?: number
          p_is_mentored_flags?: boolean[]
          p_job_ids: number[]
          p_kind: string
          p_org_id: string
          p_shift_ids: number[]
          p_source_date: string
          p_source_emp_id: string
          p_target_date: string
          p_target_emp_id: string
          p_target_expected_version?: number
          p_target_was_empty?: boolean
        }
        Returns: Json
      }
      prune_empty_schedule_cell: {
        Args: { p_cell_id: string }
        Returns: undefined
      }
      publish_schedule: {
        Args: {
          p_actor_id?: string
          p_end_date: string
          p_org_id: string
          p_start_date: string
        }
        Returns: string
      }
      purge_expired_data: {
        Args: never
        Returns: {
          audit_purged: number
          employees_purged: number
          invitations_purged: number
          org_id: string
          requests_purged: number
          shifts_purged: number
        }[]
      }
      purge_scheduled_accounts: { Args: never; Returns: Json }
      remove_focus_area_from_employees: {
        Args: { p_focus_area_id: number }
        Returns: undefined
      }
      resolve_schedule_segment_ordinal: {
        Args: {
          p_custom_end: string
          p_custom_start: string
          p_job_ids: number[]
          p_segment_index?: number
          p_shift_ids: number[]
        }
        Returns: number
      }
      resolve_schedule_state_storage: {
        Args: { p_org_id: string; p_state: Json }
        Returns: {
          absence_type_id: number
          focus_area_id: number
          is_mentored_flags: boolean[]
          job_ids: number[]
          shift_ids: number[]
          state_kind: string
        }[]
      }
      resolve_shift_request: {
        Args: { p_approved: boolean; p_note?: string; p_request_id: string }
        Returns: undefined
      }
      resolve_work_assignment_time_ranges: {
        Args: {
          p_custom_end?: string
          p_custom_start?: string
          p_job_ids: number[]
          p_shift_ids: number[]
        }
        Returns: {
          end_time: string
          segment_position: number
          start_time: string
        }[]
      }
      respond_to_shift_request: {
        Args: { p_accept: boolean; p_emp_id: string; p_request_id: string }
        Returns: undefined
      }
      schedule_cell_has_effective_content: {
        Args: { p_date: string; p_emp_id: string; p_org_id: string }
        Returns: boolean
      }
      schedule_custom_time_at: {
        Args: { p_custom_time: string; p_segment_ordinal: number }
        Returns: string
      }
      schedule_custom_times_except_ordinal: {
        Args: {
          p_custom_time: string
          p_excluded_ordinal: number
          p_segment_count: number
        }
        Returns: string
      }
      send_invitation: {
        Args: {
          p_department_ids?: number[]
          p_dept_admin_ids?: number[]
          p_email: string
          p_employee_id?: string
          p_first_name?: string
          p_last_name?: string
          p_org_id: string
          p_phone?: string
          p_role: string
        }
        Returns: Json
      }
      start_impersonation: {
        Args: {
          p_ip_address?: unknown
          p_justification: string
          p_target_org_id?: string
          p_target_user_id: string
          p_user_agent?: string
        }
        Returns: Json
      }
      switch_org: { Args: { target_org_id: string }; Returns: undefined }
      sync_schedule_cell_snapshot: {
        Args: {
          p_absence_type_id: number
          p_cell_id: string
          p_custom_end_time: string
          p_custom_start_time: string
          p_is_mentored_flags?: boolean[]
          p_job_ids: number[]
          p_org_id: string
          p_shift_ids: number[]
          p_snapshot_kind: string
          p_state_kind: string
        }
        Returns: undefined
      }
      update_schedule_last_viewed: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      update_series_all_shifts: {
        Args: { p_org_id: string; p_series_id: string; p_state: Json }
        Returns: undefined
      }
      upsert_recurring_shift: {
        Args: {
          p_day_of_week: number
          p_effective_from?: string
          p_emp_id: string
          p_org_id: string
          p_state: Json
        }
        Returns: string
      }
      volunteer_for_open_shift: {
        Args: {
          p_custom_end_time?: string
          p_custom_start_time?: string
          p_emp_id: string
          p_focus_area_id: number
          p_is_mentored_flags?: boolean[]
          p_job_ids: number[]
          p_org_id: string
          p_shift_date: string
          p_shift_ids: number[]
        }
        Returns: string
      }
      work_assignment_times_overlap: {
        Args: {
          p_custom_end_a: string
          p_custom_end_b: string
          p_custom_start_a: string
          p_custom_start_b: string
          p_job_ids_a: number[]
          p_job_ids_b: number[]
          p_shift_ids_a: number[]
          p_shift_ids_b: number[]
        }
        Returns: boolean
      }
      write_schedule_cell_snapshot: {
        Args: {
          p_absence_type_id?: number
          p_custom_end_time?: string
          p_custom_start_time?: string
          p_date: string
          p_emp_id: string
          p_expected_version?: number
          p_focus_area_id?: number
          p_from_recurring?: boolean
          p_is_mentored_flags?: boolean[]
          p_job_ids?: number[]
          p_org_id: string
          p_series_id?: string
          p_shift_ids?: number[]
          p_snapshot_kind: string
          p_state_kind: string
        }
        Returns: number
      }
      write_schedule_cell_snapshot_internal: {
        Args: {
          p_absence_type_id?: number
          p_actor_id?: string
          p_custom_end_time?: string
          p_custom_start_time?: string
          p_date: string
          p_emp_id: string
          p_expected_version?: number
          p_focus_area_id?: number
          p_from_recurring?: boolean
          p_is_mentored_flags?: boolean[]
          p_job_ids?: number[]
          p_org_id: string
          p_series_id?: string
          p_shift_ids?: number[]
          p_snapshot_kind: string
          p_state_kind: string
        }
        Returns: number
      }
    }
    Enums: {
      department_type: "scheduled" | "management"
      employee_employment_type: "full_time" | "part_time"
      employee_status: "active" | "benched" | "terminated"
      org_role: "super_admin" | "admin" | "user"
      platform_role: "gridmaster" | "none"
      profile_change_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      profile_change_request_type: "profile_update" | "account_deletion"
      shift_request_status:
        | "open"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "cancelled"
        | "expired"
      shift_request_type: "pickup" | "swap" | "calloff"
      shift_series_frequency: "daily" | "weekly" | "biweekly"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      department_type: ["scheduled", "management"],
      employee_employment_type: ["full_time", "part_time"],
      employee_status: ["active", "benched", "terminated"],
      org_role: ["super_admin", "admin", "user"],
      platform_role: ["gridmaster", "none"],
      profile_change_request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      profile_change_request_type: ["profile_update", "account_deletion"],
      shift_request_status: [
        "open",
        "pending_approval",
        "approved",
        "rejected",
        "cancelled",
        "expired",
      ],
      shift_request_type: ["pickup", "swap", "calloff"],
      shift_series_frequency: ["daily", "weekly", "biweekly"],
    },
  },
} as const
