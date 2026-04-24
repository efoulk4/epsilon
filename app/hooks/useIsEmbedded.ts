'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true when running inside the Shopify admin iframe.
 * Polls for window.shopify (injected by the App Bridge CDN script) since the
 * script loads asynchronously after React hydration.
 */
export function useIsEmbedded(): { isEmbedded: boolean; shop: string | null } {
  const [isEmbedded, setIsEmbedded] = useState(false)
  const [shop, setShop] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('shopify_shop')
    const fromUrl = new URLSearchParams(window.location.search).get('shop')
    const resolvedShop = fromUrl || stored

    function check() {
      const shopifyGlobal = (window as any).shopify
      if (shopifyGlobal) {
        setIsEmbedded(true)
        if (resolvedShop) {
          setShop(resolvedShop)
          if (!stored) sessionStorage.setItem('shopify_shop', resolvedShop)
        }
        return true
      }
      return false
    }

    // Check immediately in case the script already loaded
    if (check()) return

    // Poll until window.shopify appears (App Bridge loads async)
    const interval = setInterval(() => {
      if (check()) clearInterval(interval)
    }, 50)

    // Give up after 3 seconds — not embedded
    const timeout = setTimeout(() => clearInterval(interval), 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  return { isEmbedded, shop }
}
