'use client'

import { useEffect, createContext, useContext } from 'react'
import { createApp } from '@shopify/app-bridge'
import type { ClientApplication } from '@shopify/app-bridge'
import { useSearchParams } from 'next/navigation'

interface AppBridgeProviderProps {
  children: React.ReactNode
}

const AppBridgeContext = createContext<ClientApplication<any> | null>(null)

export function useAppBridge() {
  return useContext(AppBridgeContext)
}

export function AppBridgeProvider({ children }: AppBridgeProviderProps) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const host = searchParams.get('host')
    const shop = searchParams.get('shop')

    // Store host and shop in session storage
    if (host && typeof window !== 'undefined') {
      sessionStorage.setItem('shopify_host', host)
    }
    if (shop && typeof window !== 'undefined') {
      sessionStorage.setItem('shopify_shop', shop)
    }

    // Initialize App Bridge if we have the required parameters
    if (host && typeof window !== 'undefined') {
      const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || ''

      if (apiKey) {
        try {
          createApp({
            apiKey,
            host,
          })
        } catch (error) {
          console.error('Failed to initialize App Bridge:', error)
        }
      }
    }
  }, [searchParams])

  // Just render children - App Bridge is initialized globally
  return <>{children}</>
}
