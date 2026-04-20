import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Accessibility Auditor - Zero-Footprint WCAG Checker',
  description: 'Server-side accessibility auditing for Shopify stores using Axe-core and Playwright',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
