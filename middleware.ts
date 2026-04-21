import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Add ngrok-skip-browser-warning header to bypass ngrok interstitial page
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('ngrok-skip-browser-warning', '69420')

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Also set it in the response for future requests
  response.headers.set('ngrok-skip-browser-warning', '69420')

  return response
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
