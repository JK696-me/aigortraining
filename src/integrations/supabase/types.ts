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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      exercise_state: {
        Row: {
          base_sets: number
          current_sets: number
          current_working_weight: number
          exercise_id: string
          fail_streak: number
          id: string
          last_recommendation_text: string | null
          last_target_range: string | null
          rep_stage: number
          success_streak: number
          updated_at: string
          user_id: string
          volume_reduce_on: boolean
        }
        Insert: {
          base_sets?: number
          current_sets?: number
          current_working_weight?: number
          exercise_id: string
          fail_streak?: number
          id?: string
          last_recommendation_text?: string | null
          last_target_range?: string | null
          rep_stage?: number
          success_streak?: number
          updated_at?: string
          user_id: string
          volume_reduce_on?: boolean
        }
        Update: {
          base_sets?: number
          current_sets?: number
          current_working_weight?: number
          exercise_id?: string
          fail_streak?: number
          id?: string
          last_recommendation_text?: string | null
          last_target_range?: string | null
          rep_stage?: number
          success_streak?: number
          updated_at?: string
          user_id?: string
          volume_reduce_on?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "exercise_state_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string
          id: string
          increment_kind: string
          increment_value: number
          is_dumbbell_pair: boolean
          name: string
          type: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          increment_kind: string
          increment_value: number
          is_dumbbell_pair?: boolean
          name: string
          type: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          increment_kind?: string
          increment_value?: number
          is_dumbbell_pair?: boolean
          name?: string
          type?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      health_attachments: {
        Row: {
          created_at: string
          file_path: string
          file_url: string | null
          health_entry_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_url?: string | null
          health_entry_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_url?: string | null
          health_entry_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_attachments_health_entry_id_fkey"
            columns: ["health_entry_id"]
            isOneToOne: false
            referencedRelation: "health_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_attachments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      health_entries: {
        Row: {
          biceps_cm: number | null
          chest_cm: number | null
          created_at: string
          date: string
          glutes_cm: number | null
          id: string
          notes: string | null
          shoulders_cm: number | null
          sides_cm: number | null
          thighs_cm: number | null
          user_id: string
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          biceps_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          date: string
          glutes_cm?: number | null
          id?: string
          notes?: string | null
          shoulders_cm?: number | null
          sides_cm?: number | null
          thighs_cm?: number | null
          user_id: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          biceps_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          date?: string
          glutes_cm?: number | null
          id?: string
          notes?: string | null
          shoulders_cm?: number | null
          sides_cm?: number | null
          thighs_cm?: number | null
          user_id?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "health_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_state: {
        Row: {
          first_seen_at: string | null
          intro_completed_at: string | null
          intro_dismissed: boolean
          seed_done: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          first_seen_at?: string | null
          intro_completed_at?: string | null
          intro_dismissed?: boolean
          seed_done?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          first_seen_at?: string | null
          intro_completed_at?: string | null
          intro_dismissed?: boolean
          seed_done?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seed_template_items: {
        Row: {
          exercise_name_ru: string
          id: string
          seed_template_id: string
          sort_order: number
          target_sets: number
        }
        Insert: {
          exercise_name_ru: string
          id?: string
          seed_template_id: string
          sort_order: number
          target_sets?: number
        }
        Update: {
          exercise_name_ru?: string
          id?: string
          seed_template_id?: string
          sort_order?: number
          target_sets?: number
        }
        Relationships: [
          {
            foreignKeyName: "seed_template_items_seed_template_id_fkey"
            columns: ["seed_template_id"]
            isOneToOne: false
            referencedRelation: "seed_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      seed_templates: {
        Row: {
          description_ru: string | null
          id: string
          key: string
          title_ru: string
        }
        Insert: {
          description_ru?: string | null
          id?: string
          key: string
          title_ru: string
        }
        Update: {
          description_ru?: string | null
          id?: string
          key?: string
          title_ru?: string
        }
        Relationships: []
      }
      session_exercises: {
        Row: {
          active_set_index: number | null
          created_at: string
          exercise_id: string
          id: string
          performed_sets_count: number | null
          rpe: number | null
          session_id: string
          sort_order: number | null
        }
        Insert: {
          active_set_index?: number | null
          created_at?: string
          exercise_id: string
          id?: string
          performed_sets_count?: number | null
          rpe?: number | null
          session_id: string
          sort_order?: number | null
        }
        Update: {
          active_set_index?: number | null
          created_at?: string
          exercise_id?: string
          id?: string
          performed_sets_count?: number | null
          rpe?: number | null
          session_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          date: string
          elapsed_seconds: number | null
          id: string
          source: string
          started_at: string | null
          status: string
          template_id: string | null
          template_snapshot: Json | null
          timer_last_started_at: string | null
          timer_running: boolean | null
          undo_available_until: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          date: string
          elapsed_seconds?: number | null
          id?: string
          source: string
          started_at?: string | null
          status?: string
          template_id?: string | null
          template_snapshot?: Json | null
          timer_last_started_at?: string | null
          timer_running?: boolean | null
          undo_available_until?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          date?: string
          elapsed_seconds?: number | null
          id?: string
          source?: string
          started_at?: string | null
          status?: string
          template_id?: string | null
          template_snapshot?: Json | null
          timer_last_started_at?: string | null
          timer_running?: boolean | null
          undo_available_until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          created_at: string
          id: string
          is_completed: boolean
          reps: number
          rpe: number | null
          session_exercise_id: string
          set_index: number
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_completed?: boolean
          reps: number
          rpe?: number | null
          session_exercise_id: string
          set_index: number
          weight: number
        }
        Update: {
          created_at?: string
          id?: string
          is_completed?: boolean
          reps?: number
          rpe?: number | null
          session_exercise_id?: string
          set_index?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "sets_session_exercise_id_fkey"
            columns: ["session_exercise_id"]
            isOneToOne: false
            referencedRelation: "session_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      template_items: {
        Row: {
          exercise_id: string
          id: string
          sort_order: number
          target_sets: number
          template_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          sort_order: number
          target_sets: number
          template_id: string
        }
        Update: {
          exercise_id?: string
          id?: string
          sort_order?: number
          target_sets?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_items_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          barbell_increment: number
          dumbbells_increment: number
          machine_increment: number
          updated_at: string
          user_id: string
        }
        Insert: {
          barbell_increment?: number
          dumbbells_increment?: number
          machine_increment?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          barbell_increment?: number
          dumbbells_increment?: number
          machine_increment?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      workout_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          seed_key: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          seed_key?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          seed_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reset_training_data: { Args: never; Returns: undefined }
      undo_complete_session: { Args: { session_id: string }; Returns: Json }
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
  public: {
    Enums: {},
  },
} as const
