import { RateLimitInfo } from '../types';

/**
 * Header name to rate limit field mapping
 */
const RATE_LIMIT_HEADER_MAP: Record<string, keyof RateLimitInfo> = {
  'x-ratelimit-remaining-requests': 'requests_remaining',
  'x-ratelimit-limit-requests': 'requests_limit',
  'x-ratelimit-remaining-tokens': 'tokens_remaining',
  'x-ratelimit-limit-tokens': 'tokens_limit',
  'x-ratelimit-reset-requests': 'reset_time',
  'x-ratelimit-reset': 'reset_time',
};

/**
 * Parse rate limit headers from provider response
 */
export function parseRateLimitHeaders(headers: Headers | null): RateLimitInfo {
  const limits: RateLimitInfo = {
    requests_remaining: null,
    requests_limit: null,
    tokens_remaining: null,
    tokens_limit: null,
    reset_time: null,
  };

  if (!headers) {
    return limits;
  }

  for (const [headerName, field] of Object.entries(RATE_LIMIT_HEADER_MAP)) {
    const value = headers.get(headerName);
    if (value !== null) {
      if (field === 'reset_time') {
        limits[field] = value;
      } else {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
          limits[field] = parsed;
        }
      }
    }
  }

  return limits;
}

/**
 * Create standard headers for OpenAI-compatible APIs
 */
export function createOpenAIHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create headers for Anthropic API
 */
export function createAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
}

/**
 * Create headers for OpenRouter API
 */
export function createOpenRouterHeaders(apiKey: string, appUrl?: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': appUrl || 'http://localhost:8080',
    'X-Title': 'Turbo Console',
    'Content-Type': 'application/json',
  };
}

/**
 * Create headers for Cloudflare Workers AI
 */
export function createCloudflareHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create headers for HuggingFace Inference API
 */
export function createHuggingFaceHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create headers for Gemini API (no auth header, uses query param)
 */
export function createGeminiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Create headers for Cohere API
 */
export function createCohereHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}
