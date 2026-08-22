/**
 * In-memory rate limiter keyed by an arbitrary string (typically IP).
 *
 * Limitation: state resets on every cold start in serverless deployments.
 * For production, replace with Redis/Upstash.  For the MVP this provides
 * meaningful protection within a single instance lifetime.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Returns true if the request is allowed; false if the rate limit is exceeded.
 *
 * @param key       Unique identifier (e.g. IP address)
 * @param limit     Max requests allowed per window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}
