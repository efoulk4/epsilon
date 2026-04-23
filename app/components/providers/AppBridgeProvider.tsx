'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

interface AppBridgeProviderProps {
  children: React.ReactNode
}

export function AppBridgeProvider({ children }: AppBridgeProviderProps) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const host = searchParams.get('host')
    const shop = searchParams.get('shop')

    if (host && typeof window !== 'undefined') {
      sessionStorage.setItem('shopify_host', host)
    }
    if (shop && typeof window !== 'undefined') {
      sessionStorage.setItem('shopify_shop', shop)
    }
  }, [searchParams])

  return <>{children}</>
}
