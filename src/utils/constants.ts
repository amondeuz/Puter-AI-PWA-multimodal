import { CostTier, BoostTier, RouteKey, ProviderName, ModelCapabilities } from '../types';

/**
 * Cost tier ordering for sorting (lower index = cheaper)
 */
export const COST_TIER_ORDER: CostTier[] = ['local', 'remote_free', 'credit_backed', 'paid'];

/**
 * Boost tier to cost tier mapping
 */
export const BOOST_TIERS: Record<BoostTier, CostTier> = {
  turbo: 'remote_free',
  ultra: 'credit_backed',
};

/**
 * Maximum health history entries per provider
 */
export const MAX_HISTORY_PER_PROVIDER = 100;

/**
 * Default temperature for model calls
 */
export const DEFAULT_TEMPERATURE = 0.7;

/**
 * Default max tokens for model calls
 */
export const DEFAULT_MAX_TOKENS = 1024;

/**
 * Provider API endpoints
 */
export const PROVIDER_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  github: 'https://models.inference.ai.azure.com/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  cohere: 'https://api.cohere.com/v2/chat',
  cloudflare: 'https://api.cloudflare.com/client/v4/accounts',
  huggingface: 'https://api-inference.huggingface.co/models',
} as const;

/**
 * Provider buckets for model registry
 */
export const PROVIDER_BUCKETS: RouteKey[] = [
  'direct_api',
  'openrouter',
  'togetherai',
  'groq',
  'mistral',
  'cerebras',
  'cloudflare',
  'huggingface',
  'gemini',
  'github',
  'cohere',
  'perplexity',
  'puter',
];

/**
 * Capability keys
 */
export const CAPABILITY_KEYS: (keyof ModelCapabilities)[] = [
  'chat',
  'reasoning',
  'speed',
  'coding',
  'images',
  'audio_speech',
  'audio_music',
  'vision',
  'video',
];

/**
 * Task type to capability mapping
 */
export const TASK_CAPABILITY_MAP: Record<string, keyof ModelCapabilities> = {
  chat: 'chat',
  reasoning: 'reasoning',
  coding: 'coding',
  image_generation: 'images',
  speech: 'audio_speech',
  music: 'audio_music',
  vision: 'vision',
  video: 'video',
};

/**
 * Rating field names (for API validation)
 */
export const RATING_FIELDS = [
  'chat',
  'reasoning',
  'speed',
  'coding',
  'images',
  'audio_speech',
  'audio_music',
  'vision',
  'video',
] as const;

/**
 * Map boost tier to cost tier
 */
export function boostTierToCostTier(boostTier: string): CostTier | null {
  return BOOST_TIERS[boostTier as BoostTier] || null;
}

/**
 * Parse route key to provider and route
 */
export function parseRouteKey(routeKey: string): { provider: ProviderName; route: RouteKey } {
  const mapping: Record<string, { provider: ProviderName; route: RouteKey }> = {
    openrouter: { provider: 'openrouter', route: 'openrouter' },
    togetherai: { provider: 'togetherai', route: 'togetherai' },
    groq: { provider: 'groq', route: 'groq' },
    mistral: { provider: 'mistral', route: 'mistral' },
    cerebras: { provider: 'cerebras', route: 'cerebras' },
    cloudflare: { provider: 'cloudflare', route: 'cloudflare' },
    huggingface: { provider: 'huggingface', route: 'huggingface' },
    gemini: { provider: 'gemini', route: 'gemini' },
    github: { provider: 'github', route: 'github' },
    cohere: { provider: 'cohere', route: 'cohere' },
    perplexity: { provider: 'perplexity', route: 'perplexity' },
    puter: { provider: 'puter', route: 'puter' },
    direct_api: { provider: 'direct', route: 'direct' },
  };

  return mapping[routeKey] || { provider: routeKey as ProviderName, route: routeKey as RouteKey };
}
