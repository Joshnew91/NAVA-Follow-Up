import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseConfig } from './config'

const SETUP_PATH = '/setup'

// Webhook and job routes have no user session; each verifies its own signature or secret.
const PUBLIC_PREFIXES = ['/auth', '/api/stripe/webhook', '/api/twilio/', '/api/jobs/']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  const config = getSupabaseConfig()
  if (!config) {
    if (pathname === SETUP_PATH) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = SETUP_PATH
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (pathname === SETUP_PATH) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const supabase = createServerClient(config.url, config.key, {
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  // Must run immediately after creating the client, or sessions can be dropped.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublic = PUBLIC_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix))
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
