import { ModelCapabilities } from './models';

/**
 * Chat message format
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Provider input for model calls
 */
export interface ProviderInput {
  input?: string;
  prompt?: string;
  messages?: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  capability?: keyof ModelCapabilities;
  max_cost_tier?: string;
  model_id?: string;
  boost_tier?: string;
}

/**
 * OpenAI-compatible chat completion response
 */
export interface OpenAICompatibleResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: Array<{
    index?: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Anthropic API response
 */
export interface AnthropicResponse {
  id?: string;
  type?: string;
  role?: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * Gemini API response
 */
export interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: string;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * Cohere API response
 */
export interface CohereResponse {
  id?: string;
  message?: {
    role: string;
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  finish_reason?: string;
  usage?: {
    billed_units?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

/**
 * Cloudflare Workers AI response
 */
export interface CloudflareResponse {
  result: {
    response?: string;
  };
  success: boolean;
  errors?: Array<{ message: string }>;
  messages?: string[];
}

/**
 * HuggingFace Inference API response
 */
export interface HuggingFaceResponse {
  generated_text?: string;
  [key: string]: unknown;
}

/**
 * Provider response wrapper
 */
export interface ProviderResponse {
  data: OpenAICompatibleResponse | AnthropicResponse | GeminiResponse | CohereResponse | CloudflareResponse | HuggingFaceResponse;
  headers: Headers;
}

/**
 * Rate limit information parsed from headers
 */
export interface RateLimitInfo {
  requests_remaining: number | null;
  requests_limit: number | null;
  tokens_remaining: number | null;
  tokens_limit: number | null;
  reset_time: string | null;
}

/**
 * Cached rate limit entry
 */
export interface CachedRateLimit extends RateLimitInfo {
  updated_at: string;
}

/**
 * Provider health record
 */
export interface ProviderHealthRecord {
  model_id: string;
  success: boolean;
  latency_ms: number;
  error_message: string | null;
  timestamp: string;
}

/**
 * Provider health status
 */
export interface ProviderHealthStatus {
  provider: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency_ms: number | null;
  last_checked: string | null;
  last_success: string | null;
  last_error: string | null;
  error_count_last_hour: number;
  success_rate_last_hour: number | null;
  models_available: number;
}

/**
 * Provider call result with extracted content
 */
export interface ProviderCallResult {
  model_id: string;
  provider: string;
  route: string;
  output: string;
  raw_provider_response: unknown;
  error: string | null;
  metadata: {
    cost_tier: string;
    boost_tier: string | null;
    execution_time_ms: number;
    timestamp: string;
    usage: unknown;
    rate_limits: unknown;
  };
  boost_tier_exhausted?: boolean;
  boost_tier_message?: string | null;
}

/**
 * Model usability check result
 */
export interface ModelUsabilityResult {
  usable: boolean;
  reason: string;
  credits_required?: boolean;
  credits_available?: number | null;
  rate_limits?: CachedRateLimit | null;
}

/**
 * Puter credits status
 */
export interface PuterCreditsStatus {
  available: boolean;
  balance: number | null;
  username?: string;
  error: string | null;
}

/**
 * Boost tier exhaustion check result
 */
export interface BoostTierExhaustionResult {
  boost_tier: string;
  cost_tier?: string;
  valid: boolean;
  error?: string;
  exhausted?: boolean;
  reason?: string;
  total_models?: number;
  usable_models?: number;
  unusable_models?: number;
  usable_model_ids?: string[];
  unusable_model_ids?: string[];
  unusable_reasons?: Array<{
    model_id: string;
    provider: string;
    reason: string;
  }>;
  message?: string;
}
