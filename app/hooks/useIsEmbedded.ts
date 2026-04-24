'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true when running inside the Shopify admin iframe.
 * Uses window.shopify (injected by the App Bridge CDN script) as the
 * authoritative signal — more reliable than query params or sessionStorage,
 * which disappear after the first navigation.
 */
export function useIsEmbedded(): { isEmbedded: boolean; shop: string | null } {
  const [isEmbedded, setIsEmbedded] = useState(false)
  const [shop, setShop] = useState<string | null>(null)

  useEffect(() => {
    const shopifyGlobal = (window as any).shopify
    if (shopifyGlobal) {
      setIsEmbedded(true)
      // Shop is available in sessionStorage (set by AppBridgeProvider on first load)
      // or from the URL params that Shopify injects on install.
      const stored = sessionStorage.getItem('shopify_shop')
      const fromUrl = new URLSearchParams(window.location.search).get('shop')
      const resolvedShop = fromUrl || stored
      if (resolvedShop) {
        setShop(resolvedShop)
        if (!stored) sessionStorage.setItem('shopify_shop', resolvedShop)
      }
    }
  }, [])

  return { isEmbedded, shop }
}
