// Enhanced rate limiter for multiple endpoint types
type RateLimitEntry = {
  count: number
  resetTime: number
  blocked?: boolean
  blockUntil?: number
}

type RateLimitConfig = {
  windowMs: number
  maxRequests: number
  blockDurationMs?: number // Optional progressive blocking
}

// Different rate limits for different endpoints
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'flag_submission': { windowMs: 60000, maxRequests: 5, blockDurationMs: 300000 }, // 5/min, 5min block
  'auth_register': { windowMs: 300000, maxRequests: 3, blockDurationMs: 900000 }, // 3/5min, 15min block
  'auth_login': { windowMs: 300000, maxRequests: 10, blockDurationMs: 600000 }, // 10/5min, 10min block
  'team_operations': { windowMs: 60000, maxRequests: 10 }, // 10/min
  'challenge_hint': { windowMs: 300000, maxRequests: 20 }, // 20/5min
  'admin_actions': { windowMs: 60000, maxRequests: 30 }, // 30/min for admin ops
  'api_general': { windowMs: 60000, maxRequests: 100 }, // 100/min general API
}

const rateLimitMap = new Map<string, RateLimitEntry>()

export function checkRateLimit(
  identifier: string, 
  endpointType: string = 'api_general'
): { allowed: boolean; remaining: number; resetTime: number; blocked?: boolean } {
  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.api_general
  const key = `${endpointType}:${identifier}`
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  // Check if currently blocked
  if (entry?.blocked && entry.blockUntil && now < entry.blockUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockUntil,
      blocked: true
    }
  }

  if (!entry || now > entry.resetTime) {
    // First request or window expired
    const newEntry: RateLimitEntry = { 
      count: 1, 
      resetTime: now + config.windowMs,
      blocked: false
    }
    rateLimitMap.set(key, newEntry)
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: newEntry.resetTime
    }
  }

  if (entry.count >= config.maxRequests) {
    // Rate limit exceeded - apply progressive blocking if configured
    if (config.blockDurationMs) {
      entry.blocked = true
      entry.blockUntil = now + config.blockDurationMs
    }
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      blocked: entry.blocked
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime
  }
}

export function getRemainingRequests(
  identifier: string, 
  endpointType: string = 'api_general'
): number {
  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.api_general
  const key = `${endpointType}:${identifier}`
  const entry = rateLimitMap.get(key)
  const now = Date.now()
  
  if (!entry || now > entry.resetTime) {
    return config.maxRequests
  }
  
  return Math.max(0, config.maxRequests - entry.count)
}

export function isBlocked(identifier: string, endpointType: string = 'api_general'): boolean {
  const key = `${endpointType}:${identifier}`
  const entry = rateLimitMap.get(key)
  const now = Date.now()
  
  return !!(entry?.blocked && entry.blockUntil && now < entry.blockUntil)
}

// Enhanced cleanup function
export function cleanupRateLimitEntries(): void {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    // Remove expired entries and unblocked entries
    if (now > entry.resetTime && (!entry.blocked || (entry.blockUntil && now > entry.blockUntil))) {
      rateLimitMap.delete(key)
    }
  }
}

// Cleanup old entries every 5 minutes
setInterval(cleanupRateLimitEntries, 300000)

// Utility to create rate limit middleware response
export function createRateLimitResponse(result: ReturnType<typeof checkRateLimit>) {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
  }
  
  if (result.blocked) {
    headers['Retry-After'] = Math.ceil((result.resetTime - Date.now()) / 1000).toString()
  }
  
  return { headers, status: result.allowed ? 200 : 429 }
}
