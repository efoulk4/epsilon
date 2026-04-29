'use server'

import { requireVerifiedShop } from '@/app/utils/auth'
import { shopifyGraphQL } from '@/app/utils/shopifyClient'
import { getShopifySession, saveShopifySession, type ShopPlan } from '@/app/utils/shopifySession'

const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL!

const PLANS: Record<string, { name: string; price: string; plan: ShopPlan }> = {
  basic: { name: 'Basic', price: '9.00', plan: 'basic' },
  pro: { name: 'Pro', price: '29.00', plan: 'pro' },
}

export interface PlanStatus {
  plan: ShopPlan
  trialActive: boolean
  trialEndsAt: string | null
  trialDaysLeft: number | null
  effectivePlan: ShopPlan | 'trial'
}

export async function getPlanStatus(idToken?: string): Promise<PlanStatus> {
  try {
    const shop = await requireVerifiedShop(idToken)
    const session = await getShopifySession(shop)

    const plan = session?.plan ?? 'free'
    const trialEndsAt = session?.trial_ends_at ?? null
    const trialActive = trialEndsAt ? new Date(trialEndsAt) > new Date() : false
    const trialDaysLeft = trialActive
      ? Math.ceil((new Date(trialEndsAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null

    return {
      plan,
      trialActive,
      trialEndsAt,
      trialDaysLeft,
      effectivePlan: trialActive ? 'trial' : plan,
    }
  } catch {
    return { plan: 'free', trialActive: false, trialEndsAt: null, trialDaysLeft: null, effectivePlan: 'free' }
  }
}

export async function createSubscription(
  planKey: 'basic' | 'pro',
  idToken?: string
): Promise<{ success: boolean; confirmationUrl?: string; error?: string }> {
  const shop = await requireVerifiedShop(idToken)
  const plan = PLANS[planKey]

  const mutation = `
    mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test) {
        appSubscription { id status }
        confirmationUrl
        userErrors { field message }
      }
    }
  `

  try {
    const isTest = process.env.NODE_ENV !== 'production'
    const data = await shopifyGraphQL(shop, mutation, {
      name: `Epsilon ${plan.name}`,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: plan.price, currencyCode: 'USD' },
              interval: 'EVERY_30_DAYS',
            },
          },
        },
      ],
      returnUrl: `${SHOPIFY_APP_URL}/api/billing/callback?plan=${planKey}&shop=${shop}`,
      test: isTest,
    })

    const result = data?.appSubscriptionCreate
    if (result?.userErrors?.length > 0) {
      return { success: false, error: result.userErrors[0].message }
    }

    return { success: true, confirmationUrl: result?.confirmationUrl }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Billing error' }
  }
}

export async function cancelSubscription(
  idToken?: string
): Promise<{ success: boolean; error?: string }> {
  const shop = await requireVerifiedShop(idToken)

  const listQuery = `
    query {
      currentAppInstallation {
        activeSubscriptions { id name }
      }
    }
  `

  try {
    const listData = await shopifyGraphQL(shop, listQuery, {})
    const subs = listData?.currentAppInstallation?.activeSubscriptions ?? []

    for (const sub of subs) {
      const cancelMutation = `
        mutation appSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription { id status }
            userErrors { field message }
          }
        }
      `
      await shopifyGraphQL(shop, cancelMutation, { id: sub.id })
    }

    const session = await getShopifySession(shop)
    if (session) {
      await saveShopifySession({
        shop,
        accessToken: session.access_token,
        scope: session.scope ?? undefined,
        expiresAt: session.expires_at ? new Date(session.expires_at) : undefined,
        refreshToken: session.refresh_token ?? undefined,
        refreshTokenExpiresAt: session.refresh_token_expires_at
          ? new Date(session.refresh_token_expires_at)
          : undefined,
        isOnline: session.is_online,
        plan: 'free',
      })
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Cancel error' }
  }
}
