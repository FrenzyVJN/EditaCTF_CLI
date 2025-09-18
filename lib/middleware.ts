import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, createRateLimitResponse } from './rate-limiter'

// Rate limit configurations for different endpoints
const RATE_LIMIT_MAPPING: Record<string, string> = {
  '/api/flag': 'flag_submission',
  '/api/admin/auth': 'auth_register',
  '/api/profile': 'auth_login',
  '/api/team/create': 'team_operations',
  '/api/team/join': 'team_operations',
  '/api/team/leave': 'team_operations',
  '/api/challenges': 'challenge_hint',
  '/api/admin/': 'admin_actions', // Prefix match for admin routes
}

export async function rateLimitMiddleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
           request.headers.get('x-real-ip') || 
           'unknown'
  const pathname = request.nextUrl.pathname
  
  // Determine rate limit type based on endpoint
  let rateLimitType = 'api_general'
  for (const [path, type] of Object.entries(RATE_LIMIT_MAPPING)) {
    if (pathname.startsWith(path)) {
      rateLimitType = type
      break
    }
  }
  
  // Check rate limit
  const rateLimitResult = checkRateLimit(ip, rateLimitType)
  
  if (!rateLimitResult.allowed) {
    const { headers, status } = createRateLimitResponse(rateLimitResult)
    
    return NextResponse.json(
      { 
        error: rateLimitResult.blocked ? 'Rate limit exceeded. You are temporarily blocked.' : 'Rate limit exceeded', 
        resetTime: rateLimitResult.resetTime,
        blocked: rateLimitResult.blocked 
      },
      { status, headers }
    )
  }
  
  return NextResponse.next()
}

export async function authMiddleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Get auth token from either Authorization header or cookie
  const authHeader = request.headers.get('authorization')
  const authToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const authCookie = request.cookies.get('sb-access-token')
  
  const hasAuth = authToken || authCookie
  
  // Protect admin routes
  if (pathname.startsWith('/api/admin/') || pathname.startsWith('/admin')) {
    if (!hasAuth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    // Note: Individual API endpoints will validate the JWT token and permissions
  }
  
  // Protect authenticated routes
  const protectedRoutes = ['/api/flag', '/api/team/', '/api/profile', '/api/me/']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  
  if (isProtectedRoute && !hasAuth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  
  return NextResponse.next()
}

export async function corsMiddleware(request: NextRequest) {
  const response = NextResponse.next()
  
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (request.method === 'OPTIONS') {
    return NextResponse.json(null, { status: 200, headers: response.headers })
  }
  
  return response
}

// Security headers middleware
export async function securityHeadersMiddleware(request: NextRequest) {
  const response = NextResponse.next()
  
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co"
  )
  
  return response
}

// Main middleware composer
export async function middleware(request: NextRequest) {
  // Handle preflight requests first
  if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api/')) {
    return corsMiddleware(request)
  }
  
  // Apply rate limiting
  const rateLimitResult = await rateLimitMiddleware(request)
  if (rateLimitResult.status !== 200) {
    return rateLimitResult
  }
  
  // Apply authentication
  const authResult = await authMiddleware(request)
  if (authResult.status !== 200) {
    return authResult
  }
  
  // Apply security headers
  const response = await securityHeadersMiddleware(request)
  
  // Add CORS headers for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  
  // Add rate limit headers
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
           request.headers.get('x-real-ip') || 
           'unknown'
  const pathname = request.nextUrl.pathname
  let rateLimitType = 'api_general'
  
  for (const [path, type] of Object.entries(RATE_LIMIT_MAPPING)) {
    if (pathname.startsWith(path)) {
      rateLimitType = type
      break
    }
  }
  
  const rateLimitInfo = checkRateLimit(ip, rateLimitType)
  const { headers } = createRateLimitResponse(rateLimitInfo)
  
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  
  return response
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)',
  ],
}