import { CachedRateLimit, RateLimitInfo } from '../types';
import { parseRateLimitHeaders } from '../utils/headers';

/**
 * Service for caching and managing rate limit information
 */
class RateLimitService {
  private cache: Record<string, CachedRateLimit> = {};

  /**
   * Get cache key for provider/model combination
   */
  private getCacheKey(provider: string, modelId: string): string {
    return `${provider}:${modelId}`;
  }

  /**
   * Update rate limit cache from response headers
   */
  updateFromHeaders(provider: string, modelId: string, headers: Headers): void {
    const limits = parseRateLimitHeaders(headers);
    const cacheKey = this.getCacheKey(provider, modelId);

    this.cache[cacheKey] = {
      ...limits,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Get cached rate limits for a provider/model
   */
  get(provider: string, modelId: string): CachedRateLimit | null {
    const cacheKey = this.getCacheKey(provider, modelId);
    return this.cache[cacheKey] || null;
  }

  /**
   * Get the entire cache
   */
  getAll(): Record<string, CachedRateLimit> {
    return { ...this.cache };
  }

  /**
   * Check if a provider/model is rate limited
   */
  isRateLimited(provider: string, modelId: string): boolean {
    const cached = this.get(provider, modelId);
    if (!cached) return false;

    // Check request limit
    if (cached.requests_remaining !== null && cached.requests_remaining <= 0) {
      return true;
    }

    // Check token limit
    if (cached.tokens_remaining !== null && cached.tokens_remaining <= 0) {
      return true;
    }

    return false;
  }

  /**
   * Get estimated wait time in seconds
   */
  getWaitTime(provider: string, modelId: string): number {
    const cached = this.get(provider, modelId);
    if (!cached || !cached.reset_time) return 60; // Default to 60 seconds

    const resetTime = new Date(cached.reset_time).getTime();
    const now = Date.now();
    const waitMs = Math.max(0, resetTime - now);

    return Math.ceil(waitMs / 1000);
  }

  /**
   * Clear cache for a specific provider/model
   */
  clear(provider: string, modelId: string): void {
    const cacheKey = this.getCacheKey(provider, modelId);
    delete this.cache[cacheKey];
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    this.cache = {};
  }

  /**
   * Store rate limits directly (for manual updates)
   */
  store(provider: string, modelId: string, limits: RateLimitInfo): void {
    const cacheKey = this.getCacheKey(provider, modelId);
    this.cache[cacheKey] = {
      ...limits,
      updated_at: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const rateLimitService = new RateLimitService();

// Export class for testing
export { RateLimitService };
