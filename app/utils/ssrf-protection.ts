import dns from 'dns/promises'
import { isIP } from 'net'

/**
 * SSRF Protection: Validate URLs before making outbound requests
 * Prevents attacks targeting internal networks, localhost, metadata endpoints
 */

// Blocked IP ranges (RFC1918, loopback, link-local, etc.)
const BLOCKED_IP_RANGES = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '::1', end: '::1' },

  // Private IPv4 (RFC1918)
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },

  // Link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff' },

  // CGNAT (Carrier-Grade NAT)
  { start: '100.64.0.0', end: '100.127.255.255' },

  // Unspecified
  { start: '0.0.0.0', end: '0.255.255.255' },
  { start: '::', end: '::' },
]

// Cloud metadata endpoints
const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP/Azure metadata
  'metadata',
  'localhost',
]

export interface URLValidationResult {
  allowed: boolean
  error?: string
  resolvedIP?: string
}

/**
 * Validate that a fetch response doesn't redirect to blocked destinations
 * Call this before following redirects
 */
export async function validateRedirect(redirectUrl: string): Promise<URLValidationResult> {
  return await validateURL(redirectUrl)
}

/**
 * Validate URL for SSRF protection
 */
export async function validateURL(url: string): Promise<URLValidationResult> {
  try {
    const parsed = new URL(url)

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return {
        allowed: false,
        error: 'Only HTTPS URLs are allowed',
      }
    }

    // Reject URLs with credentials
    if (parsed.username || parsed.password) {
      return {
        allowed: false,
        error: 'URLs with embedded credentials are not allowed',
      }
    }

    // Check hostname against blocklist
    const hostname = parsed.hostname.toLowerCase()
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return {
        allowed: false,
        error: `Blocked hostname: ${hostname}`,
      }
    }

    // If hostname is already an IP, validate it
    if (isIP(hostname)) {
      if (isBlockedIP(hostname)) {
        return {
          allowed: false,
          error: 'Private/internal IP addresses are not allowed',
        }
      }
      return { allowed: true, resolvedIP: hostname }
    }

    // Resolve DNS and check if it points to blocked IPs
    try {
      const addresses = await dns.resolve(hostname)

      for (const addr of addresses) {
        if (isBlockedIP(addr)) {
          return {
            allowed: false,
            error: `Hostname resolves to blocked IP: ${addr}`,
          }
        }
      }

      return { allowed: true, resolvedIP: addresses[0] }
    } catch (dnsError) {
      return {
        allowed: false,
        error: 'DNS resolution failed',
      }
    }
  } catch (error) {
    return {
      allowed: false,
      error: error instanceof Error ? error.message : 'Invalid URL',
    }
  }
}

/**
 * Check if an IP address is in blocked ranges
 * Handles both IPv4 and IPv6 with proper canonical parsing
 */
function isBlockedIP(ip: string): boolean {
  // Localhost checks
  if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') {
    return true
  }

  // IPv4 blocked ranges
  if (isIP(ip) === 4) {
    // Loopback: 127.0.0.0/8
    if (ip.startsWith('127.')) return true

    // Private networks (RFC1918)
    if (ip.startsWith('10.')) return true
    if (ip.startsWith('192.168.')) return true
    if (ip.startsWith('172.')) {
      const parts = ip.split('.')
      const second = parseInt(parts[1])
      if (second >= 16 && second <= 31) return true
    }

    // Link-local: 169.254.0.0/16
    if (ip.startsWith('169.254.')) return true

    // CGNAT: 100.64.0.0/10
    if (ip.startsWith('100.')) {
      const parts = ip.split('.')
      const second = parseInt(parts[1])
      if (second >= 64 && second <= 127) return true
    }

    // Unspecified / This network: 0.0.0.0/8
    if (ip.startsWith('0.')) return true

    // Broadcast: 255.255.255.255
    if (ip === '255.255.255.255') return true

    // Multicast: 224.0.0.0/4
    const firstOctet = parseInt(ip.split('.')[0])
    if (firstOctet >= 224 && firstOctet <= 239) return true
  }

  // IPv6 blocked ranges
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase()

    // Loopback: ::1
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true

    // Unspecified: ::
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true

    // Link-local: fe80::/10
    if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') ||
        lower.startsWith('fea') || lower.startsWith('feb')) return true

    // Unique local: fc00::/7
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true

    // IPv4-mapped IPv6: ::ffff:0:0/96
    if (lower.includes('::ffff:')) {
      // Extract IPv4 part and check it
      const ipv4Match = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/)
      if (ipv4Match && isBlockedIP(ipv4Match[1])) return true
    }

    // Multicast: ff00::/8
    if (lower.startsWith('ff')) return true
  }

  return false
}

/**
 * Validate Shopify store URL specifically
 */
export async function validateShopifyStoreURL(shop: string): Promise<URLValidationResult> {
  // Construct the URL
  const url = `https://${shop}`

  // Validate it's a proper .myshopify.com domain
  if (!shop.endsWith('.myshopify.com')) {
    return {
      allowed: false,
      error: 'Only .myshopify.com domains are allowed',
    }
  }

  // Run standard SSRF validation
  return await validateURL(url)
}

/**
 * Validate image URL for alt-text generation
 * Only allow Shopify CDN domains
 */
export function validateImageURL(url: string): URLValidationResult {
  try {
    const parsed = new URL(url)

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return {
        allowed: false,
        error: 'Only HTTPS image URLs are allowed',
      }
    }

    // Allow only Shopify CDN domains
    const allowedDomains = [
      'cdn.shopify.com',
      'cdn.shopifycdn.net',
    ]

    const hostname = parsed.hostname.toLowerCase()
    const isAllowed = allowedDomains.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    )

    if (!isAllowed) {
      return {
        allowed: false,
        error: 'Only Shopify CDN image URLs are allowed',
      }
    }

    return { allowed: true }
  } catch (error) {
    return {
      allowed: false,
      error: 'Invalid image URL',
    }
  }
}
