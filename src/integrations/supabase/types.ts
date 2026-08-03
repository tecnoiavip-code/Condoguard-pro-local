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
      access_entries: {
        Row: {
          apartment: string
          auto_recognized: boolean | null
          badge_number: string | null
          company: string | null
          entry_time: string | null
          exit_time: string | null
          id: string
          notes: string | null
          photo_url: string | null
          purpose: string | null
          registered_by: string | null
          resident_id: string | null
          resident_name: string | null
          vehicle_color: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          visitor_document: string
          visitor_name: string
          visitor_type: string | null
        }
        Insert: {
          apartment: string
          auto_recognized?: boolean | null
          badge_number?: string | null
          company?: string | null
          entry_time?: string | null
          exit_time?: string | null
          id?: string
          notes?: string | null
          photo_url?: string | null
          purpose?: string | null
          registered_by?: string | null
          resident_id?: string | null
          resident_name?: string | null
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          visitor_document: string
          visitor_name: string
          visitor_type?: string | null
        }
        Update: {
          apartment?: string
          auto_recognized?: boolean | null
          badge_number?: string | null
          company?: string | null
          entry_time?: string | null
          exit_time?: string | null
          id?: string
          notes?: string | null
          photo_url?: string | null
          purpose?: string | null
          registered_by?: string | null
          resident_id?: string | null
          resident_name?: string | null
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          visitor_document?: string
          visitor_name?: string
          visitor_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_entries_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_attachments: {
        Row: {
          announcement_id: string
          content_type: string | null
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
        }
        Insert: {
          announcement_id: string
          content_type?: string | null
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
        }
        Update: {
          announcement_id?: string
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_attachments_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          priority: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          priority?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          priority?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      blocked_visitors: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          id: string
          is_active: boolean
          reason: string | null
          visitor_document: string
          visitor_name: string
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          id?: string
          is_active?: boolean
          reason?: string | null
          visitor_document: string
          visitor_name: string
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          id?: string
          is_active?: boolean
          reason?: string | null
          visitor_document?: string
          visitor_name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          resident_id: string
          sender_id: string
          sender_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          resident_id: string
          sender_id: string
          sender_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          resident_id?: string
          sender_id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      controlid_config: {
        Row: {
          api_path: string | null
          created_at: string | null
          device_id: string | null
          device_ip: string
          device_name: string
          device_port: string | null
          id: string
          is_active: boolean | null
          last_sync: string | null
          updated_at: string | null
        }
        Insert: {
          api_path?: string | null
          created_at?: string | null
          device_id?: string | null
          device_ip: string
          device_name: string
          device_port?: string | null
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          updated_at?: string | null
        }
        Update: {
          api_path?: string | null
          created_at?: string | null
          device_id?: string | null
          device_ip?: string
          device_name?: string
          device_port?: string | null
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      controlid_logs: {
        Row: {
          device_id: string
          event_type: string
          id: string
          payload: Json
          processed: boolean | null
          received_at: string | null
        }
        Insert: {
          device_id: string
          event_type: string
          id?: string
          payload: Json
          processed?: boolean | null
          received_at?: string | null
        }
        Update: {
          device_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean | null
          received_at?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string | null
          id: string
          ip_address: string | null
          last_sync: string | null
          location: string
          name: string
          serial_number: string | null
          status: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          last_sync?: string | null
          location: string
          name: string
          serial_number?: string | null
          status?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          last_sync?: string | null
          location?: string
          name?: string
          serial_number?: string | null
          status?: string | null
          type?: string | null
        }
        Relationships: []
      }
      incidents: {
        Row: {
          created_at: string | null
          description: string
          id: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          shift_id: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          shift_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          shift_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      mails: {
        Row: {
          delivered_at: string | null
          id: string
          notes: string | null
          package_type: string | null
          photo_url: string | null
          received_at: string | null
          registered_by: string | null
          resident_id: string
          sender: string
          status: string | null
          tracking_code: string | null
          withdrawn_by: string | null
        }
        Insert: {
          delivered_at?: string | null
          id?: string
          notes?: string | null
          package_type?: string | null
          photo_url?: string | null
          received_at?: string | null
          registered_by?: string | null
          resident_id: string
          sender: string
          status?: string | null
          tracking_code?: string | null
          withdrawn_by?: string | null
        }
        Update: {
          delivered_at?: string | null
          id?: string
          notes?: string | null
          package_type?: string | null
          photo_url?: string | null
          received_at?: string | null
          registered_by?: string | null
          resident_id?: string
          sender?: string
          status?: string | null
          tracking_code?: string | null
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mails_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          id: string
          read: boolean | null
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      portaria_equipment: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id: string
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      push_command_queue: {
        Row: {
          command: Json
          created_at: string
          device_id: string
          executed_at: string | null
          id: string
          result: Json | null
          status: string
        }
        Insert: {
          command: Json
          created_at?: string
          device_id: string
          executed_at?: string | null
          id?: string
          result?: Json | null
          status?: string
        }
        Update: {
          command?: Json
          created_at?: string
          device_id?: string
          executed_at?: string | null
          id?: string
          result?: Json | null
          status?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      realtime_events: {
        Row: {
          created_at: string | null
          description: string
          id: string
          priority: string
          related_id: string | null
          timestamp: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          priority: string
          related_id?: string | null
          timestamp?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          priority?: string
          related_id?: string | null
          timestamp?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      residents: {
        Row: {
          apartment: string
          auth_user_id: string | null
          cpf: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          photo_url: string | null
          updated_at: string | null
          vehicle_color: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_tag: string | null
        }
        Insert: {
          apartment: string
          auth_user_id?: string | null
          cpf?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          photo_url?: string | null
          updated_at?: string | null
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_tag?: string | null
        }
        Update: {
          apartment?: string
          auth_user_id?: string | null
          cpf?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          photo_url?: string | null
          updated_at?: string | null
          vehicle_color?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_tag?: string | null
        }
        Relationships: []
      }
      shift_equipment_checks: {
        Row: {
          checked_at: string
          checked_by: string | null
          equipment_id: string
          id: string
          notes: string | null
          shift_id: string
          status: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          equipment_id: string
          id?: string
          notes?: string | null
          shift_id: string
          status?: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          equipment_id?: string
          id?: string
          notes?: string | null
          shift_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_equipment_checks_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "portaria_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_equipment_checks_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          shift_end: string | null
          shift_start: string
          shift_type: string
          team_members: string[]
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          shift_end?: string | null
          shift_start: string
          shift_type?: string
          team_members: string[]
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          shift_end?: string | null
          shift_start?: string
          shift_type?: string
          team_members?: string[]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vapid_keys: {
        Row: {
          created_at: string
          id: string
          private_key: string
          public_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          private_key: string
          public_key: string
        }
        Update: {
          created_at?: string
          id?: string
          private_key?: string
          public_key?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          model: string | null
          plate: string
          resident_id: string
          tag: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          model?: string | null
          plate: string
          resident_id: string
          tag?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          model?: string | null
          plate?: string
          resident_id?: string
          tag?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_authorizations: {
        Row: {
          authorized_date: string
          authorized_until: string | null
          created_at: string | null
          id: string
          purpose: string | null
          resident_id: string
          reviewed_by: string | null
          staff_notes: string | null
          status: string | null
          updated_at: string | null
          vehicle_plate: string | null
          visitor_document: string | null
          visitor_name: string
        }
        Insert: {
          authorized_date: string
          authorized_until?: string | null
          created_at?: string | null
          id?: string
          purpose?: string | null
          resident_id: string
          reviewed_by?: string | null
          staff_notes?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_plate?: string | null
          visitor_document?: string | null
          visitor_name: string
        }
        Update: {
          authorized_date?: string
          authorized_until?: string | null
          created_at?: string | null
          id?: string
          purpose?: string | null
          resident_id?: string
          reviewed_by?: string | null
          staff_notes?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_plate?: string | null
          visitor_document?: string | null
          visitor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_authorizations_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify_all_staff: {
        Args: {
          _body: string
          _related_id?: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "security_guard" | "receptionist" | "resident"
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
    Enums: {
      app_role: ["admin", "security_guard", "receptionist", "resident"],
    },
  },
} as const
