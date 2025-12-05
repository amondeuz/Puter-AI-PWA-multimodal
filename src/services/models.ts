import {
  Model,
  ScoredModel,
  ModelCapabilities,
  ModelRatings,
  CostTier,
  Database,
  ModelFilterQuery,
  ModelSuggestionConstraints,
  PinokioModel,
  PinokioFilterQuery,
} from '../types';
import {
  COST_TIER_ORDER,
  PROVIDER_BUCKETS,
  CAPABILITY_KEYS,
  parseRouteKey,
} from '../utils/constants';
import { ratingsService } from './ratings';

/**
 * Create a default capability template
 */
export function capabilityTemplate(flags: Partial<ModelCapabilities> = {}): ModelCapabilities {
  const result: ModelCapabilities = {
    chat: false,
    reasoning: false,
    speed: false,
    coding: false,
    images: false,
    audio_speech: false,
    audio_music: false,
    vision: false,
    video: false,
  };

  for (const key of CAPABILITY_KEYS) {
    if (flags[key]) {
      result[key] = true;
    }
  }

  return result;
}

/**
 * Generate ratings from capabilities (1 if supported, 0 if not)
 */
export function ratingFromCapabilities(capabilities: ModelCapabilities): ModelRatings {
  const ratings: ModelRatings = {};
  for (const [key, supported] of Object.entries(capabilities)) {
    ratings[key as keyof ModelRatings] = supported ? 1 : 0;
  }
  return ratings;
}

/**
 * Normalize cost tier from database
 */
export function normalizeCostTier(modelId: string, db: Database): CostTier {
  if (db.free_models && db.free_models.includes(modelId)) {
    return 'remote_free';
  }

  const details = db.model_details || {};
  if (details[modelId] && details[modelId].cost_tier) {
    return details[modelId].cost_tier as CostTier;
  }

  return 'paid';
}

/**
 * Infer capabilities from model ID
 */
export function inferCapabilities(modelId: string): ModelCapabilities {
  const lowered = modelId.toLowerCase();

  if (lowered.includes('whisper')) {
    return capabilityTemplate({ audio_speech: true, speed: true });
  }

  if (lowered.includes('tts') || lowered.includes('playai')) {
    return capabilityTemplate({ audio_speech: true, speed: true });
  }

  if (lowered.includes('img') || lowered.includes('vision') || lowered.includes('image')) {
    return capabilityTemplate({ vision: true, images: true });
  }

  if (lowered.includes('video') || lowered.includes('sora')) {
    return capabilityTemplate({ video: true });
  }

  // Default to chat model capabilities
  return capabilityTemplate({ chat: true, reasoning: true, speed: true, coding: true });
}

/**
 * Build the complete model list from database
 */
export function buildModelList(db: Database): Model[] {
  const details = db.model_details || {};
  const models: Model[] = [];

  for (const [companyKey, company] of Object.entries(db.model_registry || {})) {
    for (const bucket of PROVIDER_BUCKETS) {
      const modelIds = company[bucket as keyof typeof company];
      if (!Array.isArray(modelIds)) continue;

      for (const modelId of modelIds) {
        const { provider, route } = parseRouteKey(bucket);
        const base = details[modelId] || {};
        const capabilities = base.capabilities
          ? capabilityTemplate(base.capabilities)
          : inferCapabilities(modelId);

        models.push({
          id: modelId,
          provider: base.provider || provider,
          company: companyKey,
          route: base.route || route,
          capabilities,
          ratings: base.ratings || ratingFromCapabilities(capabilities),
          limits: base.limits || {},
          cost_tier: base.cost_tier || normalizeCostTier(modelId, db),
          uses_puter_credits: Boolean(base.uses_puter_credits),
          cost_notes: base.cost_notes || '',
          notes: base.notes || '',
        });
      }
    }
  }

  return models;
}

/**
 * Filter models based on query
 */
export function filterModels(models: Model[], query: ModelFilterQuery): Model[] {
  return models.filter((model) => {
    if (query.provider && model.provider !== query.provider) return false;
    if (query.cost_tier && model.cost_tier !== query.cost_tier) return false;
    if (query.capability && !model.capabilities[query.capability]) return false;
    return true;
  });
}

/**
 * Suggest models based on constraints, sorted by quality and cost
 */
export function suggestModels(models: Model[], constraints: ModelSuggestionConstraints = {}): ScoredModel[] {
  const filtered = filterModels(models, constraints);
  const capabilityKey = constraints.capability || 'chat';
  const maxCostIndex = constraints.max_cost_tier
    ? COST_TIER_ORDER.indexOf(constraints.max_cost_tier)
    : COST_TIER_ORDER.length - 1;

  return filtered
    .filter((m) => {
      const idx = COST_TIER_ORDER.indexOf(m.cost_tier);
      return idx !== -1 && idx <= maxCostIndex;
    })
    .map((model) => {
      const rating = (model.ratings && model.ratings[capabilityKey]) || 0;
      return { ...model, score: rating };
    })
    .sort((a, b) => {
      const aIdx = COST_TIER_ORDER.indexOf(a.cost_tier);
      const bIdx = COST_TIER_ORDER.indexOf(b.cost_tier);
      if (aIdx !== bIdx) return aIdx - bIdx;
      if (b.score !== a.score) return b.score - a.score;
      return (b.ratings?.speed || 0) - (a.ratings?.speed || 0);
    });
}

/**
 * Pick a model based on input constraints
 */
export function pickModel(models: Model[], input: { model_id?: string; capability?: keyof ModelCapabilities; max_cost_tier?: CostTier }): Model | null {
  if (input.model_id) {
    return models.find((m) => m.id === input.model_id) || null;
  }

  const suggestions = suggestModels(models, {
    capability: input.capability,
    max_cost_tier: input.max_cost_tier,
  });

  return suggestions[0] || null;
}

/**
 * Transform model to Pinokio API format
 */
export function transformModelForPinokio(model: Model, db: Database): PinokioModel {
  const details = db.model_details?.[model.id] || {};
  const limits = model.limits || details.rate_limits || {};
  const overrides = ratingsService.getOverrides()[model.id] || {};

  return {
    model_id: model.id,
    display_name: details.display_name || model.id,
    provider_id: model.provider,
    family: model.company,
    modality: details.types || (model.capabilities?.chat ? ['chat'] : []),

    // Capabilities
    supports_chat: Boolean(model.capabilities?.chat),
    supports_reasoning: Boolean(model.capabilities?.reasoning),
    supports_coding: Boolean(model.capabilities?.coding),
    supports_images: Boolean(model.capabilities?.images),
    supports_audio_speech: Boolean(model.capabilities?.audio_speech),
    supports_audio_music: Boolean(model.capabilities?.audio_music),
    supports_vision: Boolean(model.capabilities?.vision),
    supports_video: Boolean(model.capabilities?.video),

    // Ratings (apply overrides)
    chat_rating: overrides.chat ?? model.ratings?.chat ?? null,
    reasoning_rating: overrides.reasoning ?? model.ratings?.reasoning ?? null,
    speed_rating: overrides.speed ?? model.ratings?.speed ?? null,
    coding_rating: overrides.coding ?? model.ratings?.coding ?? null,
    images_rating: overrides.images ?? model.ratings?.images ?? null,
    audio_speech_rating: overrides.audio_speech ?? model.ratings?.audio_speech ?? null,
    audio_music_rating: overrides.audio_music ?? model.ratings?.audio_music ?? null,
    vision_rating: overrides.vision ?? model.ratings?.vision ?? null,
    video_rating: overrides.video ?? model.ratings?.video ?? null,

    // Limits
    requests_per_minute: limits.rpm ?? null,
    requests_per_day: limits.rpd ?? null,
    tokens_per_minute: limits.tpm ?? null,
    tokens_per_day: limits.tpd ?? null,
    tokens_per_month: limits.tpm_month ?? null,
    neurons_per_day: limits.neurons_per_day ?? null,
    audio_seconds_per_hour: limits.audio_seconds_per_hour ?? null,
    audio_seconds_per_day: limits.audio_seconds_per_day ?? null,

    // Cost
    cost_tier: model.cost_tier || 'paid',
    uses_puter_credits: Boolean(model.uses_puter_credits),

    // Metadata (apply notes override)
    notes: overrides.notes ?? model.notes ?? details.cost_notes ?? '',
    limit_source: details.rate_limit_source || limits.source || null,
    limits_last_verified: details.last_updated || null,
  };
}

/**
 * Filter models in Pinokio format
 */
export function filterModelsPinokio(models: PinokioModel[], query: PinokioFilterQuery): PinokioModel[] {
  return models.filter((model) => {
    // Provider filter
    if (query.provider) {
      const providers = Array.isArray(query.provider) ? query.provider : [query.provider];
      if (!providers.includes(model.provider_id)) return false;
    }

    // Cost tier filter
    if (query.cost_tier) {
      const tiers = Array.isArray(query.cost_tier) ? query.cost_tier : [query.cost_tier];
      if (!tiers.includes(model.cost_tier)) return false;
    }

    // Capability filters
    if (query.requires_chat === 'true' && !model.supports_chat) return false;
    if (query.requires_reasoning === 'true' && !model.supports_reasoning) return false;
    if (query.requires_coding === 'true' && !model.supports_coding) return false;
    if (query.requires_images === 'true' && !model.supports_images) return false;
    if (query.requires_audio_speech === 'true' && !model.supports_audio_speech) return false;
    if (query.requires_audio_music === 'true' && !model.supports_audio_music) return false;
    if (query.requires_vision === 'true' && !model.supports_vision) return false;
    if (query.requires_video === 'true' && !model.supports_video) return false;

    // Minimum rating filters
    const ratingFields = ['chat', 'reasoning', 'speed', 'coding', 'images', 'audio_speech', 'audio_music', 'vision', 'video'] as const;
    for (const field of ratingFields) {
      const minRating = query[`min_${field}_rating` as keyof PinokioFilterQuery];
      if (minRating !== undefined) {
        const rating = model[`${field}_rating` as keyof PinokioModel] as number | null;
        if (rating === null || rating < parseInt(minRating as string)) return false;
      }
    }

    return true;
  });
}

/**
 * Sort Pinokio models
 */
export function sortModelsPinokio(models: PinokioModel[], sortBy?: string, sortOrder: 'asc' | 'desc' = 'desc'): PinokioModel[] {
  if (!sortBy) return models;

  const order = sortOrder === 'asc' ? 1 : -1;

  return [...models].sort((a, b) => {
    const aVal = a[sortBy as keyof PinokioModel] ?? -Infinity;
    const bVal = b[sortBy as keyof PinokioModel] ?? -Infinity;

    if (aVal === bVal) return 0;
    return (aVal > bVal ? 1 : -1) * order;
  });
}
