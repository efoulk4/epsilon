import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Check if Supabase is configured
export const isSupabaseConfigured =
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'your_supabase_url_here' &&
  supabaseAnonKey !== 'your_supabase_anon_key_here'

// Create a dummy client if not configured (to avoid errors during build/dev)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key')

// Database types
export type Database = {
  public: {
    Tables: {
      audits: {
        Row: {
          id: string
          url: string
          timestamp: string
          total_violations: number
          violations_by_impact: {
            critical: number
            serious: number
            moderate: number
            minor: number
          }
          health_score: number
          violations: any[]
          created_at: string
        }
        Insert: {
          id?: string
          url: string
          timestamp: string
          total_violations: number
          violations_by_impact: {
            critical: number
            serious: number
            moderate: number
            minor: number
          }
          health_score: number
          violations: any[]
          created_at?: string
        }
        Update: {
          id?: string
          url?: string
          timestamp?: string
          total_violations?: number
          violations_by_impact?: {
            critical: number
            serious: number
            moderate: number
            minor: number
          }
          health_score?: number
          violations?: any[]
          created_at?: string
        }
      }
    }
  }
}
