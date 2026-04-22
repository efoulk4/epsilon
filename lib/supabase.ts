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

/**
 * SECURITY: Server-side Supabase client (uses service role key, bypasses RLS)
 * Use ONLY in server actions and API routes with verified authentication
 * Call this function explicitly - do NOT use a global export
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('[getSupabaseAdmin] Missing credentials:', {
      hasUrl: !!url,
      hasServiceKey: !!serviceKey,
    })
    throw new Error('Supabase admin client credentials not configured')
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// SECURITY: Global export removed - use getSupabaseAdmin() function instead
// This prevents accidental use of privileged client in unsafe code paths

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
