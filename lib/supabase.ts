import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Check if Supabase is configured
export const isSupabaseConfigured =
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'your_supabase_url_here' &&
  supabaseAnonKey !== 'your_supabase_anon_key_here'

// Client-side Supabase client (uses anon key, respects RLS)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key')

// Server-side Supabase client (uses service role key, bypasses RLS)
// Use this for server actions and API routes
export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
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
