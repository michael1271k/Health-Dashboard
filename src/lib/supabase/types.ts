// ============================================
// APEX Supabase Database Types
// Hand-authored (run `supabase gen types` after provisioning to regenerate)
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      daily_metrics: {
        Row: {
          id: string
          user_id: string
          date: string                // ISO date YYYY-MM-DD
          steps: number | null
          active_cal: number | null
          rest_hr: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['daily_metrics']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['daily_metrics']['Insert']>
      }
      supplement_log: {
        Row: {
          user_id: string
          date: string
          item_key: string
          taken: boolean
          taken_at: string | null
          updated_at: string
        }
        Insert: { user_id: string; date: string; item_key: string; taken?: boolean; taken_at?: string | null }
        Update: Partial<{ taken: boolean; taken_at: string | null }>
      }
      sleep_sessions: {
        Row: {
          id: string
          user_id: string
          hk_uuid: string | null
          start_time: string
          end_time: string
          duration_min: number
          deep_min: number
          rem_min: number
          core_min: number
          awake_min: number
          sleep_score: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['sleep_sessions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['sleep_sessions']['Insert']>
      }
      nutrition_entries: {
        Row: {
          id: string
          user_id: string
          hk_uuid: string | null
          logged_at: string
          date: string
          meal_type: string | null
          calories: number
          protein_g: number
          carbs_g: number
          fat_g: number
          fiber_g: number | null
          phase: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['nutrition_entries']['Row'], 'id' | 'created_at' | 'phase'> & { phase?: string | null }
        Update: Partial<Database['public']['Tables']['nutrition_entries']['Insert']>
      }
      body_composition: {
        Row: {
          id: string
          user_id: string
          hk_uuid: string | null
          measured_at: string
          date: string
          weight_kg: number
          body_fat_pct: number | null
          muscle_mass_kg: number | null
          water_pct: number | null
          bone_mass_kg: number | null
          bmi: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['body_composition']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['body_composition']['Insert']>
      }
      water_intake: {
        Row: {
          id: string
          user_id: string
          hk_uuid: string | null
          logged_at: string
          date: string
          amount_ml: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['water_intake']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['water_intake']['Insert']>
      }
      supplements: {
        Row: {
          id: string
          user_id: string
          hk_uuid: string | null
          taken_at: string
          date: string
          name: string
          quantity: number | null
          unit: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['supplements']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['supplements']['Insert']>
      }
      exercises: {
        Row: {
          id: string
          user_id: string
          name: string
          name_he: string | null
          split_day: 'push' | 'pull' | 'legs' | 'upper' | 'lower'
          muscle_groups: string[] | null
          is_compound: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['exercises']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['exercises']['Insert']>
      }
      workout_sessions: {
        Row: {
          id: string
          user_id: string
          notion_page_id: string | null
          started_at: string
          ended_at: string | null
          split_day: 'push' | 'pull' | 'legs' | 'upper' | 'lower'
          notes: string | null
          total_volume_kg: number | null
          session_score: number | null
          set_count: number | null
          pr_count: number | null
          duration_min: number | null
          calories_burned: number | null
          avg_bpm: number | null
          report_md: string | null
          migrated_from_notion: boolean
          status: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database['public']['Tables']['workout_sessions']['Row'],
          'id' | 'created_at' | 'updated_at'
            | 'set_count' | 'pr_count' | 'duration_min' | 'calories_burned'
            | 'avg_bpm' | 'report_md' | 'migrated_from_notion' | 'status'
        > & {
          set_count?: number | null
          pr_count?: number | null
          duration_min?: number | null
          calories_burned?: number | null
          avg_bpm?: number | null
          report_md?: string | null
          migrated_from_notion?: boolean
          status?: string
        }
        Update: Partial<Database['public']['Tables']['workout_sessions']['Insert']>
      }
      workout_sets: {
        Row: {
          id: string
          session_id: string
          exercise_id: string
          user_id: string
          set_number: number
          weight_kg: number
          reps: number
          rpe: number | null
          is_pr: boolean
          est_1rm_kg: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['workout_sets']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['workout_sets']['Insert']>
      }
      daily_scores: {
        Row: {
          id: string
          user_id: string
          date: string
          score: number
          sleep_score: number | null
          nutrition_score: number | null
          activity_score: number | null
          workout_score: number | null
          recovery_score: number | null
          battery_pct: number | null
          computed_at: string
        }
        Insert: Omit<Database['public']['Tables']['daily_scores']['Row'], 'id' | 'computed_at'>
        Update: Partial<Database['public']['Tables']['daily_scores']['Insert']>
      }
      user_goals: {
        Row: {
          id: string
          user_id: string
          sleep_goal_hours: number
          calorie_goal: number
          protein_goal_g: number | null
          carbs_goal_g: number | null
          fat_goal_g: number | null
          steps_goal: number
          active_cal_goal: number
          water_goal_ml: number
          context_mode: 'normal' | 'travel' | 'illness' | 'emergency'
          goal_preset: string | null
          day_cutoff_hour: number
          unit_system: 'kg' | 'lb'
          reduce_motion: boolean
          auto_log_supplements: boolean
          active_program: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['user_goals']['Row'], 'id' | 'created_at' | 'updated_at' | 'day_cutoff_hour' | 'unit_system' | 'reduce_motion' | 'auto_log_supplements' | 'active_program'>
          & { day_cutoff_hour?: number; unit_system?: 'kg' | 'lb'; reduce_motion?: boolean; auto_log_supplements?: boolean; active_program?: string }
        Update: Partial<Database['public']['Tables']['user_goals']['Insert']>
      }
      daily_logs: {
        Row: {
          id: string
          user_id: string
          date: string
          steps: number | null
          water_ml: number | null
          sleep_minutes: number | null
          carbs_g: number | null
          protein_g: number | null
          fats_g: number | null
          weight_kg: number | null
          lean_mass_kg: number | null
          bmi: number | null
          training_minutes: number | null
          active_energy: number | null
          body_fat_pct: number | null
          standing_minutes: number | null
          avg_heart_rate: number | null
          avg_rest_heart_rate: number | null
          respiratory_rate: number | null
          blood_oxygen: number | null
          muscle_percent: number | null
          water_percent: number | null
          bone_mineral: number | null
          visceral_fat: number | null
          bmr: number | null
          created_at: string
          updated_at: string
        }
        Insert: { user_id: string; date: string } & Partial<
          Omit<Database['public']['Tables']['daily_logs']['Row'], 'id' | 'user_id' | 'date' | 'created_at' | 'updated_at'>
        >
        Update: Partial<Database['public']['Tables']['daily_logs']['Insert']>
      }
      reports: {
        Row: {
          id: string
          user_id: string
          type: 'weekly'
          period_start: string
          period_end: string
          content_md: string
          session_summary_md: string | null
          weight_report_md: string | null
          metrics: Record<string, unknown> | null
          notion_page_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['reports']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['reports']['Insert']>
      }
      nutrition_phases: {
        Row: {
          id: string
          user_id: string
          mode: string
          calorie_goal: number | null
          protein_g: number | null
          carbs_g: number | null
          fat_g: number | null
          effective_from: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['nutrition_phases']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['nutrition_phases']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
