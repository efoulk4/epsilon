'use client'

import { useCallback } from 'react'
import { useAppBridge } from '@shopify/app-bridge-react'

/**
 * Returns a function that fetches a fresh Shopify session token.
 * Pass the returned token as the last argument to any server action
 * that calls requireVerifiedShop(), since server actions cannot set
 * their own Authorization headers.
 *
 * Returns null when not running inside the Shopify admin (standalone mode).
 */
export function useIdToken() {
  const shopify = useAppBridge()

  return useCallback(async (): Promise<string | undefined> => {
    try {
      return await shopify.idToken()
    } catch {
      // Not embedded — standalone / non-Shopify context
      return undefined
    }
  }, [shopify])
}
