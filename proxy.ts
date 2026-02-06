import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect Admin Routes
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      const res = NextResponse.next()
      Object.entries(NO_STORE_HEADERS).forEach(([k, v]) =>
        res.headers.set(k, v),
      )
      return res
    }
    const adminToken = request.cookies.get('admin_token')
    if (!adminToken) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
  }

  const res = NextResponse.next()
  Object.entries(NO_STORE_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image).*)'],
}
