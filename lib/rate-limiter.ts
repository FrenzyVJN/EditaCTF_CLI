// Simple in-memory rate limiter for flag submissions
type RateLimitEntry = {
  count: number
  resetTime: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

export function checkRateLimit(identifier: string, maxRequests = 5, windowMs = 60000): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)

  if (!entry || now > entry.resetTime) {
    // First request or window expired
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (entry.count >= maxRequests) {
    return false // Rate limit exceeded
  }

  entry.count++
  return true
}

export function getRemainingRequests(identifier: string, maxRequests = 5): number {
  const entry = rateLimitMap.get(identifier)
  if (!entry || Date.now() > entry.resetTime) {
    return maxRequests
  }
  return Math.max(0, maxRequests - entry.count)
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}, 300000) // Clean up every 5 minutes
