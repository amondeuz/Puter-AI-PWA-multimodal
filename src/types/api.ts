import { Model, ModelCapabilities, CostTier, BoostTier, PinokioModel, ProviderName } from './models';
import { ProviderHealthStatus, ChatMessage, CachedRateLimit, BoostTierExhaustionResult, PuterCreditsStatus } from './providers';

// ============================================================================
// Models Endpoint Types
// ============================================================================

/**
 * GET /models query parameters
 */
export interface ModelsQueryParams {
  provider?: ProviderName;
  cost_tier?: CostTier;
  capability?: keyof ModelCapabilities;
}

/**
 * GET /models response
 */
export interface ModelsResponse {
  models: Model[];
  count: number;
  timestamp: string;
}

/**
 * POST /suggest-models request body
 */
export interface SuggestModelsRequest {
  provider?: ProviderName;
  cost_tier?: CostTier;
  capability?: keyof ModelCapabilities;
  max_cost_tier?: CostTier;
  boost_tier?: BoostTier;
}

/**
 * POST /suggest-models response
 */
export interface SuggestModelsResponse {
  models: Model[];
  count: number;
  boost_tier: BoostTier | null;
  timestamp: string;
}

// ============================================================================
// Run Endpoint Types
// ============================================================================

/**
 * POST /run request body
 */
export interface RunRequest {
  model_id?: string;
  capability?: keyof ModelCapabilities;
  max_cost_tier?: CostTier;
  boost_tier?: BoostTier;
  input?: string;
  prompt?: string;
  messages?: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

/**
 * POST /run success response
 */
export interface RunSuccessResponse {
  model_id: string;
  provider: ProviderName;
  route: string;
  output: string;
  raw_provider_response: unknown;
  error: null;
  metadata: {
    cost_tier: CostTier;
    boost_tier: BoostTier | null;
    execution_time_ms: number;
    timestamp: string;
    usage: unknown;
    rate_limits: unknown;
  };
  boost_tier_exhausted: boolean;
  boost_tier_message: string | null;
}

/**
 * POST /run error response
 */
export interface RunErrorResponse {
  error: string;
  error_type: 'rate_limit_exceeded' | 'provider_error';
  provider: ProviderName | undefined;
  model_id: string | undefined;
  retry_after_seconds: number | null;
  suggestion: {
    next_best_model: string;
    next_best_provider: ProviderName;
    reason: string;
  } | null;
  metadata: {
    execution_time_ms: number;
    timestamp: string;
  };
}

// ============================================================================
// Account Status Endpoint Types
// ============================================================================

/**
 * GET /account/status query parameters
 */
export interface AccountStatusQueryParams {
  boost_tier?: BoostTier;
  include_credits?: string;
}

/**
 * GET /account/status response
 */
export interface AccountStatusResponse {
  puter_account: string;
  puter_credits: PuterCreditsStatus | null;
  boost_tier_requested: BoostTier;
  boost_tier_status: BoostTierExhaustionResult;
  other_tier_status: BoostTierExhaustionResult;
  account_exhausted: boolean;
  recommendation: string;
  timestamp: string;
}

// ============================================================================
// Preflight Endpoint Types
// ============================================================================

/**
 * POST /preflight request body
 */
export interface PreflightRequest {
  boost_tier: BoostTier;
  task_type?: string;
  capability?: keyof ModelCapabilities;
  estimated_tokens?: number;
}

/**
 * POST /preflight response
 */
export interface PreflightResponse {
  boost_tier: BoostTier;
  cost_tier: CostTier;
  boost_tier_exhausted: boolean;
  can_run: boolean;
  candidate_models: Array<{
    model_id: string;
    provider: ProviderName;
    capabilities: ModelCapabilities;
    ratings: Model['ratings'];
  }>;
  suggested_model: string | null;
  message: string;
  timestamp: string;
}

/**
 * Batch preflight task
 */
export interface BatchPreflightTask {
  model_id?: string;
  provider?: ProviderName;
  capability?: keyof ModelCapabilities;
  estimated_tokens?: number;
}

/**
 * POST /api/preflight/batch request body
 */
export interface BatchPreflightRequest {
  boost_tier: BoostTier;
  tasks: BatchPreflightTask[];
}

/**
 * Batch preflight task result
 */
export interface BatchPreflightTaskResult {
  task_index: number;
  can_run: boolean;
  reason: string;
  suggested_model?: string;
  suggested_provider?: ProviderName;
  estimated_wait_seconds?: number;
}

/**
 * POST /api/preflight/batch response
 */
export interface BatchPreflightResponse {
  batch_can_run: boolean;
  tasks_runnable: number;
  tasks_blocked: number;
  total_estimated_tokens: number;
  results: BatchPreflightTaskResult[];
  recommendation: string;
  timestamp: string;
}

// ============================================================================
// Health Endpoint Types
// ============================================================================

/**
 * GET /health response
 */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}

/**
 * GET /api/providers/health response
 */
export interface ProvidersHealthResponse {
  providers: ProviderHealthStatus[];
  summary: {
    total_providers: number;
    healthy: number;
    degraded: number;
    down: number;
    unknown: number;
  };
  timestamp: string;
}

// ============================================================================
// Pinokio API Endpoint Types
// ============================================================================

/**
 * GET /api/models response
 */
export interface PinokioModelsResponse {
  models: PinokioModel[];
  count: number;
  timestamp: string;
}

/**
 * GET /api/models/:model_id response is PinokioModel

/**
 * GET /api/models/presets query parameters
 */
export interface PresetsQueryParams {
  cost_tiers?: string;
  top_n?: string;
}

/**
 * GET /api/models/presets response
 */
export interface PresetsResponse {
  presets: {
    best_reasoning: PinokioModel[];
    fastest_chat: PinokioModel[];
    best_coding: PinokioModel[];
    best_vision: PinokioModel[];
    all_free_models: PinokioModel[];
  };
  timestamp: string;
}

/**
 * PATCH /api/models/:model_id/rating request body
 */
export interface UpdateRatingRequest {
  chat_rating?: number;
  reasoning_rating?: number;
  speed_rating?: number;
  coding_rating?: number;
  images_rating?: number;
  audio_speech_rating?: number;
  audio_music_rating?: number;
  vision_rating?: number;
  video_rating?: number;
  notes?: string;
}

/**
 * PATCH /api/models/:model_id/rating response
 */
export interface UpdateRatingResponse {
  success: boolean;
  model_id: string;
  updates: Record<string, number | string>;
  persisted: boolean;
  message: string;
  timestamp: string;
}

/**
 * GET /api/rate-limits response
 */
export interface RateLimitsResponse {
  cache: Record<string, CachedRateLimit>;
  timestamp: string;
}

// ============================================================================
// Error Response Types
// ============================================================================

/**
 * Generic error response
 */
export interface ErrorResponse {
  error: string;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Validation error response
 */
export interface ValidationErrorResponse extends ErrorResponse {
  field?: string;
  value?: unknown;
  valid_fields?: string[];
}

/**
 * Not found error response
 */
export interface NotFoundErrorResponse extends ErrorResponse {
  model_id?: string;
}
