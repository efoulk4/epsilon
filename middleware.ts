import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Handle Shopify install flow: when Shopify hits the app URL with ?shop= but
  // without embedded=1, it's an install/re-install. Redirect to the OAuth install route.
  if (pathname === '/') {
    const shop = searchParams.get('shop')
    const embedded = searchParams.get('embedded')
    const hmac = searchParams.get('hmac')

    // hmac present = Shopify-signed request (install or re-install)
    // embedded=1 absent = not already inside the admin iframe
    if (shop && hmac && embedded !== '1') {
      const installUrl = new URL('/api/auth/shopify/install', request.url)
      installUrl.searchParams.set('shop', shop)
      return NextResponse.redirect(installUrl)
    }
  }

  // SECURITY: Only apply ngrok headers in development
  const isDevelopment = process.env.NODE_ENV === 'development'

  if (isDevelopment) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('ngrok-skip-browser-warning', '69420')

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    })
    response.headers.set('ngrok-skip-browser-warning', '69420')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
