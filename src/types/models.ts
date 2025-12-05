/**
 * Model capability flags
 */
export interface ModelCapabilities {
  chat: boolean;
  reasoning: boolean;
  speed: boolean;
  coding: boolean;
  images: boolean;
  audio_speech: boolean;
  audio_music: boolean;
  vision: boolean;
  video: boolean;
}

/**
 * Model ratings (0-5 scale)
 */
export interface ModelRatings {
  chat?: number;
  reasoning?: number;
  speed?: number;
  coding?: number;
  images?: number;
  audio_speech?: number;
  audio_music?: number;
  vision?: number;
  video?: number;
}

/**
 * Model rate limits
 */
export interface ModelLimits {
  rpm?: number;           // Requests per minute
  rpd?: number;           // Requests per day
  tpm?: number;           // Tokens per minute
  tpd?: number;           // Tokens per day
  tpm_month?: number;     // Tokens per month
  neurons_per_day?: number;
  audio_seconds_per_hour?: number;
  audio_seconds_per_day?: number;
  source?: string;
}

/**
 * Cost tier enumeration
 */
export type CostTier = 'local' | 'remote_free' | 'credit_backed' | 'paid';

/**
 * Boost tier enumeration
 */
export type BoostTier = 'turbo' | 'ultra';

/**
 * Provider name type
 */
export type ProviderName =
  | 'groq'
  | 'mistral'
  | 'openrouter'
  | 'cerebras'
  | 'cloudflare'
  | 'huggingface'
  | 'gemini'
  | 'github'
  | 'cohere'
  | 'perplexity'
  | 'puter'
  | 'openai'
  | 'anthropic'
  | 'direct'
  | 'togetherai';

/**
 * Route key type
 */
export type RouteKey =
  | 'groq'
  | 'mistral'
  | 'openrouter'
  | 'cerebras'
  | 'cloudflare'
  | 'huggingface'
  | 'gemini'
  | 'github'
  | 'cohere'
  | 'perplexity'
  | 'puter'
  | 'direct'
  | 'togetherai'
  | 'direct_api';

/**
 * Core model representation
 */
export interface Model {
  id: string;
  provider: ProviderName;
  company: string;
  route: RouteKey;
  capabilities: ModelCapabilities;
  ratings: ModelRatings;
  limits: ModelLimits;
  cost_tier: CostTier;
  uses_puter_credits: boolean;
  cost_notes: string;
  notes: string;
}

/**
 * Model with computed score for suggestions
 */
export interface ScoredModel extends Model {
  score: number;
}

/**
 * Model details from database
 */
export interface ModelDetails {
  provider?: ProviderName;
  route?: RouteKey;
  capabilities?: Partial<ModelCapabilities>;
  ratings?: ModelRatings;
  limits?: ModelLimits;
  rate_limits?: ModelLimits;
  cost_tier?: CostTier;
  uses_puter_credits?: boolean;
  cost_notes?: string;
  notes?: string;
  display_name?: string;
  types?: string[];
  rate_limit_source?: string;
  last_updated?: string;
}

/**
 * Model filter query
 */
export interface ModelFilterQuery {
  provider?: ProviderName;
  cost_tier?: CostTier;
  capability?: keyof ModelCapabilities;
}

/**
 * Model suggestion constraints
 */
export interface ModelSuggestionConstraints extends ModelFilterQuery {
  max_cost_tier?: CostTier;
}

/**
 * Parsed route key result
 */
export interface ParsedRouteKey {
  provider: ProviderName;
  route: RouteKey;
}

/**
 * Pinokio API model format
 */
export interface PinokioModel {
  model_id: string;
  display_name: string;
  provider_id: ProviderName;
  family: string;
  modality: string[];

  // Capabilities
  supports_chat: boolean;
  supports_reasoning: boolean;
  supports_coding: boolean;
  supports_images: boolean;
  supports_audio_speech: boolean;
  supports_audio_music: boolean;
  supports_vision: boolean;
  supports_video: boolean;

  // Ratings (0-5, nullable)
  chat_rating: number | null;
  reasoning_rating: number | null;
  speed_rating: number | null;
  coding_rating: number | null;
  images_rating: number | null;
  audio_speech_rating: number | null;
  audio_music_rating: number | null;
  vision_rating: number | null;
  video_rating: number | null;

  // Limits (nullable)
  requests_per_minute: number | null;
  requests_per_day: number | null;
  tokens_per_minute: number | null;
  tokens_per_day: number | null;
  tokens_per_month: number | null;
  neurons_per_day: number | null;
  audio_seconds_per_hour: number | null;
  audio_seconds_per_day: number | null;

  // Cost
  cost_tier: CostTier;
  uses_puter_credits: boolean;

  // Metadata
  notes: string;
  limit_source: string | null;
  limits_last_verified: string | null;
}

/**
 * Pinokio filter query
 */
export interface PinokioFilterQuery {
  provider?: ProviderName | ProviderName[];
  cost_tier?: CostTier | CostTier[];
  requires_chat?: string;
  requires_reasoning?: string;
  requires_coding?: string;
  requires_images?: string;
  requires_audio_speech?: string;
  requires_audio_music?: string;
  requires_vision?: string;
  requires_video?: string;
  min_chat_rating?: string;
  min_reasoning_rating?: string;
  min_speed_rating?: string;
  min_coding_rating?: string;
  min_images_rating?: string;
  min_audio_speech_rating?: string;
  min_audio_music_rating?: string;
  min_vision_rating?: string;
  min_video_rating?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
