'use client'

import { AppProvider } from '@shopify/polaris'
import '@shopify/polaris/build/esm/styles.css'

export function PolarisProvider({ children }: { children: React.ReactNode }) {
  return <AppProvider i18n={{}}>{children}</AppProvider>
}
