'use server'

import { requireVerifiedShop } from '@/app/utils/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export interface ProductNotification {
  id: string
  product_title: string
  product_handle: string
  violations: { type: string; description: string }[]
  created_at: string
}

export async function getUnseenNotifications(idToken?: string): Promise<ProductNotification[]> {
  const shop = await requireVerifiedShop(idToken)
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('product_notifications')
    .select('id, product_title, product_handle, violations, created_at')
    .eq('shop', shop)
    .eq('seen', false)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getUnseenNotifications] Error:', error.message)
    return []
  }

  return data as ProductNotification[]
}

export async function markNotificationsSeen(ids: string[], idToken?: string): Promise<void> {
  const shop = await requireVerifiedShop(idToken)
  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('product_notifications')
    .update({ seen: true })
    .in('id', ids)
    .eq('shop', shop) // Ensure shop can only mark its own notifications

  if (error) {
    console.error('[markNotificationsSeen] Error:', error.message)
  }
}
