'use client'

import { useCallback } from 'react'

/**
 * Returns a function that fetches a fresh Shopify session token via App Bridge v4.
 * Pass the returned token as the last argument to any server action that calls
 * requireVerifiedShop(), since server actions cannot set their own Authorization headers.
 *
 * Returns undefined when not running inside the Shopify admin (standalone mode).
 */
export function useIdToken() {
  return useCallback(async (): Promise<string | undefined> => {
    try {
      // shopify.idToken() is available on the global injected by the Shopify admin iframe
      const shopifyGlobal = (window as any).shopify
      if (!shopifyGlobal?.idToken) return undefined
      return await shopifyGlobal.idToken()
    } catch {
      return undefined
    }
  }, [])
}
