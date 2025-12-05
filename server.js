const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const COST_TIER_ORDER = ['local', 'remote_free', 'credit_backed', 'paid'];

// ============================================================================
// DATABASE LOADING
// ============================================================================

function loadDb() {
  const dbPath = path.join(__dirname, 'model-company-database-v3-complete.json');
  const raw = fs.readFileSync(dbPath, 'utf8');
  return JSON.parse(raw);
}

// ============================================================================
// BOOST TIER SYSTEM & ACCOUNT EXHAUSTION
// ============================================================================

// Boost tier mapping
const BOOST_TIERS = {
  turbo: 'remote_free',      // Free-tier models (no cost)
  ultra: 'credit_backed'     // Puter credit-backed models
};

// Map boost tier to cost tier
function boostTierToCostTier(boostTier) {
  return BOOST_TIERS[boostTier] || null;
}

// Get Puter credit balance (uses Puter SDK if available)
async function getPuterCredits() {
  try {
    if (typeof puter === 'undefined' || !puter.auth) {
      return {
        available: false,
        balance: null,
        error: 'Puter SDK not available - not running inside Puter environment'
      };
    }

    // Check if user is signed in
    const isSignedIn = await puter.auth.isSignedIn();
    if (!isSignedIn) {
      return {
        available: false,
        balance: null,
        error: 'No Puter user signed in'
      };
    }

    // Get user info which includes credit balance
    // Note: Actual API may vary - adjust based on Puter SDK documentation
    const user = await puter.auth.getUser();

    return {
      available: true,
      balance: user.credits || 0,
      username: user.username,
      error: null
    };
  } catch (error) {
    return {
      available: false,
      balance: null,
      error: error.message
    };
  }
}

// Parse rate limit headers from provider response
function parseRateLimitHeaders(headers, provider) {
  const limits = {
    requests_remaining: null,
    requests_limit: null,
    tokens_remaining: null,
    tokens_limit: null,
    reset_time: null
  };

  if (!headers) return limits;

  // Common header patterns across providers (Groq, Mistral, OpenAI-compatible)
  const headerMap = {
    'x-ratelimit-remaining-requests': 'requests_remaining',
    'x-ratelimit-limit-requests': 'requests_limit',
    'x-ratelimit-remaining-tokens': 'tokens_remaining',
    'x-ratelimit-limit-tokens': 'tokens_limit',
    'x-ratelimit-reset-requests': 'reset_time',
    'x-ratelimit-reset': 'reset_time'
  };

  for (const [headerName, field] of Object.entries(headerMap)) {
    const value = headers.get ? headers.get(headerName) : headers[headerName];
    if (value !== undefined && value !== null) {
      limits[field] = field.includes('time') ? value : parseInt(value);
    }
  }

  return limits;
}

// In-memory rate limit cache (key: "provider:model_id", value: parsed limits)
const rateLimitCache = {};

// ============================================================================
// RATINGS PERSISTENCE
// ============================================================================

const RATINGS_FILE = path.join(__dirname, 'ratings-overrides.json');

function loadRatingsOverrides() {
  try {
    if (fs.existsSync(RATINGS_FILE)) {
      return JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not load ratings overrides:', e.message);
  }
  return {};
}

function saveRatingsOverrides(overrides) {
  fs.writeFileSync(RATINGS_FILE, JSON.stringify(overrides, null, 2));
}

// Load ratings overrides on startup
let ratingsOverrides = loadRatingsOverrides();

// ============================================================================
// PROVIDER HEALTH TRACKING
// ============================================================================

// In-memory provider health tracking (last 100 calls per provider)
const providerHealthHistory = {};
const MAX_HISTORY_PER_PROVIDER = 100;

function recordProviderHealth(provider, modelId, success, latencyMs, errorMessage) {
  if (!providerHealthHistory[provider]) {
    providerHealthHistory[provider] = [];
  }

  providerHealthHistory[provider].push({
    model_id: modelId,
    success: success,
    latency_ms: latencyMs,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });

  // Keep only last MAX_HISTORY_PER_PROVIDER entries
  if (providerHealthHistory[provider].length > MAX_HISTORY_PER_PROVIDER) {
    providerHealthHistory[provider].shift();
  }
}

function getProviderHealthStatus(provider, db) {
  const history = providerHealthHistory[provider] || [];

  if (history.length === 0) {
    return {
      provider: provider,
      status: 'unknown',
      latency_ms: null,
      last_checked: null,
      last_success: null,
      last_error: null,
      error_count_last_hour: 0,
      success_rate_last_hour: null,
      models_available: buildModelList(db).filter(m => m.provider === provider).length
    };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentHistory = history.filter(h => new Date(h.timestamp) > oneHourAgo);
  const lastCall = history[history.length - 1];
  const lastSuccess = [...history].reverse().find(h => h.success);

  const successCount = recentHistory.filter(h => h.success).length;
  const totalCount = recentHistory.length;
  const successRate = totalCount > 0 ? successCount / totalCount : null;
  const errorCount = recentHistory.filter(h => !h.success).length;

  // Calculate average latency from successful calls
  const successfulCalls = recentHistory.filter(h => h.success && h.latency_ms);
  const avgLatency = successfulCalls.length > 0
    ? Math.round(successfulCalls.reduce((sum, h) => sum + h.latency_ms, 0) / successfulCalls.length)
    : null;

  // Determine status
  let status = 'unknown';
  if (totalCount > 0) {
    if (successRate >= 0.95 && (avgLatency === null || avgLatency < 2000)) {
      status = 'healthy';
    } else if (successRate >= 0.5 && (avgLatency === null || avgLatency < 5000)) {
      status = 'degraded';
    } else {
      status = 'down';
    }

    // Check if last success was too long ago
    if (lastSuccess) {
      const lastSuccessTime = new Date(lastSuccess.timestamp).getTime();
      const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
      if (lastSuccessTime < fifteenMinutesAgo && totalCount > 5) {
        status = 'down';
      }
    }
  }

  return {
    provider: provider,
    status: status,
    latency_ms: avgLatency,
    last_checked: lastCall?.timestamp || null,
    last_success: lastSuccess?.timestamp || null,
    last_error: lastCall?.success === false ? lastCall.error_message : null,
    error_count_last_hour: errorCount,
    success_rate_last_hour: successRate,
    models_available: buildModelList(db).filter(m => m.provider === provider).length
  };
}

// Check if a model is usable for current Puter account
async function isModelUsable(model, db) {
  const modelId = model.id;
  const provider = model.provider;
  const costTier = model.cost_tier;

  // If model uses Puter credits, check credit balance
  if (model.uses_puter_credits || costTier === 'credit_backed') {
    const credits = await getPuterCredits();

    if (!credits.available) {
      // Can't verify - assume unusable if we can't check
      return {
        usable: false,
        reason: 'Cannot verify Puter credits: ' + credits.error,
        credits_required: true,
        credits_available: null
      };
    }

    if (credits.balance <= 0) {
      return {
        usable: false,
        reason: 'Puter credits exhausted (balance: 0)',
        credits_required: true,
        credits_available: credits.balance
      };
    }

    // Has credits - usable
    return {
      usable: true,
      reason: 'Puter credits available',
      credits_required: true,
      credits_available: credits.balance
    };
  }

  // For free-tier models, check if we have rate limit info from recent calls
  const rateLimitKey = `${provider}:${modelId}`;
  const recentLimits = rateLimitCache[rateLimitKey];

  if (recentLimits) {
    // Use real API data from recent call
    if (recentLimits.requests_remaining !== null && recentLimits.requests_remaining <= 0) {
      return {
        usable: false,
        reason: `Rate limit exhausted for ${provider} - ${recentLimits.requests_remaining} requests remaining`,
        rate_limits: recentLimits
      };
    }

    if (recentLimits.tokens_remaining !== null && recentLimits.tokens_remaining <= 0) {
      return {
        usable: false,
        reason: `Token quota exhausted for ${provider} - ${recentLimits.tokens_remaining} tokens remaining`,
        rate_limits: recentLimits
      };
    }
  }

  // No recent limit data - assume usable (optimistic)
  // Real exhaustion will be detected on actual call
  return {
    usable: true,
    reason: 'No exhaustion detected (no recent rate limit data)',
    rate_limits: recentLimits || null
  };
}

// Check if a boost tier is exhausted for current account
async function checkBoostTierExhaustion(boostTier, db) {
  const costTier = boostTierToCostTier(boostTier);

  if (!costTier) {
    return {
      boost_tier: boostTier,
      valid: false,
      error: `Invalid boost_tier: ${boostTier}. Must be 'turbo' or 'ultra'.`
    };
  }

  // Get all models for this boost tier
  const allModels = buildModelList(db);
  const tierModels = allModels.filter(m => m.cost_tier === costTier);

  if (tierModels.length === 0) {
    return {
      boost_tier: boostTier,
      cost_tier: costTier,
      valid: true,
      exhausted: true,
      reason: 'No models available for this boost tier',
      total_models: 0,
      usable_models: 0,
      unusable_models: 0
    };
  }

  // Check usability of each model
  const usabilityChecks = await Promise.all(
    tierModels.map(async (model) => ({
      model_id: model.id,
      provider: model.provider,
      check: await isModelUsable(model, db)
    }))
  );

  const usableModels = usabilityChecks.filter(c => c.check.usable);
  const unusableModels = usabilityChecks.filter(c => !c.check.usable);

  const exhausted = usableModels.length === 0;

  return {
    boost_tier: boostTier,
    cost_tier: costTier,
    valid: true,
    exhausted: exhausted,
    total_models: tierModels.length,
    usable_models: usableModels.length,
    unusable_models: unusableModels.length,
    usable_model_ids: usableModels.map(c => c.model_id),
    unusable_model_ids: unusableModels.map(c => c.model_id),
    unusable_reasons: unusableModels.map(c => ({
      model_id: c.model_id,
      provider: c.provider,
      reason: c.check.reason
    })),
    message: exhausted
      ? `All eligible ${boostTier} models are exhausted for this Puter account. Please log out of Puter OS and log into the next account in your rotation if you want to continue using this tier.`
      : `${usableModels.length} of ${tierModels.length} ${boostTier} models are still usable.`
  };
}

// ============================================================================
// MODEL UTILITIES
// ============================================================================

function capabilityTemplate(flags = {}) {
  const keys = ['chat', 'reasoning', 'speed', 'coding', 'images', 'audio_speech', 'audio_music', 'vision', 'video'];
  const result = {};
  keys.forEach((k) => {
    result[k] = Boolean(flags[k]);
  });
  return result;
}

function ratingFromCapabilities(capabilities) {
  const ratings = {};
  Object.entries(capabilities).forEach(([key, supported]) => {
    ratings[key] = supported ? 1 : 0;
  });
  return ratings;
}

function normalizeCostTier(modelId, db) {
  if (db.free_models && db.free_models.includes(modelId)) return 'remote_free';
  const details = db.model_details || {};
  if (details[modelId] && details[modelId].cost_tier) return details[modelId].cost_tier;
  return 'paid';
}

function parseRouteKey(routeKey) {
  switch (routeKey) {
    case 'openrouter':
      return { provider: 'openrouter', route: 'openrouter' };
    case 'togetherai':
      return { provider: 'togetherai', route: 'togetherai' };
    case 'groq':
      return { provider: 'groq', route: 'groq' };
    case 'mistral':
      return { provider: 'mistral', route: 'mistral' };
    case 'cerebras':
      return { provider: 'cerebras', route: 'cerebras' };
    case 'cloudflare':
      return { provider: 'cloudflare', route: 'cloudflare' };
    case 'huggingface':
      return { provider: 'huggingface', route: 'huggingface' };
    case 'gemini':
      return { provider: 'gemini', route: 'gemini' };
    case 'github':
      return { provider: 'github', route: 'github' };
    case 'cohere':
      return { provider: 'cohere', route: 'cohere' };
    case 'perplexity':
      return { provider: 'perplexity', route: 'perplexity' };
    case 'puter':
      return { provider: 'puter', route: 'puter' };
    case 'direct_api':
      return { provider: 'direct', route: 'direct' };
    default:
      return { provider: routeKey, route: routeKey };
  }
}

function inferCapabilities(modelId) {
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
  return capabilityTemplate({ chat: true, reasoning: true, speed: true, coding: true });
}

function buildModelList(db) {
  const details = db.model_details || {};
  const models = [];

  Object.entries(db.model_registry || {}).forEach(([companyKey, company]) => {
    const buckets = [
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
      'puter'
    ];
    buckets.forEach((bucket) => {
      const arr = company[bucket];
      if (!Array.isArray(arr)) return;
      arr.forEach((modelId) => {
        const { provider, route } = parseRouteKey(bucket);
        const base = details[modelId] || {};
        const capabilities = base.capabilities || inferCapabilities(modelId);
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
          notes: base.notes || ''
        });
      });
    });
  });

  return models;
}

function filterModels(models, query) {
  return models.filter((model) => {
    if (query.provider && model.provider !== query.provider) return false;
    if (query.cost_tier && model.cost_tier !== query.cost_tier) return false;
    if (query.capability) {
      if (!model.capabilities || !model.capabilities[query.capability]) return false;
    }
    return true;
  });
}

function suggestModels(models, constraints = {}) {
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

// ============================================================================
// PROVIDER INTEGRATIONS
// ============================================================================

async function callGroq(model, input) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model.id,
      messages: input.messages || [{ role: 'user', content: input.input || input.prompt || '' }],
      temperature: input.temperature || 0.7,
      max_tokens: input.max_tokens || 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callMistral(model, input) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model.id,
      messages: input.messages || [{ role: 'user', content: input.input || input.prompt || '' }],
      temperature: input.temperature || 0.7,
      max_tokens: input.max_tokens || 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callOpenRouter(model, input) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:8080',
      'X-Title': 'Turbo Console',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model.id.replace('openrouter:', ''),
      messages: input.messages || [{ role: 'user', content: input.input || input.prompt || '' }],
      temperature: input.temperature || 0.7,
      max_tokens: input.max_tokens || 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callCerebras(model, input) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY not configured');
  }

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model.id,
      messages: input.messages || [{ role: 'user', content: input.input || input.prompt || '' }],
      temperature: input.temperature || 0.7,
      max_tokens: input.max_tokens || 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cerebras API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callCloudflare(model, input) {
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiKey) {
    throw new Error('CLOUDFLARE_API_KEY not configured');
  }
  if (!accountId) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID not configured');
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model.id}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: input.messages || [{ role: 'user', content: input.input || input.prompt || '' }],
      temperature: input.temperature || 0.7,
      max_tokens: input.max_tokens || 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudflare API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callHuggingFace(model, input) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error('HUGGINGFACE_API_KEY not configured');
  }

  const response = await fetch(`https://api-inference.huggingface.co/models/${model.id}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: input.input || input.prompt || '',
      parameters: {
        temperature: input.temperature || 0.7,
        max_new_tokens: input.max_tokens || 1024
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hugging Face API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callGemini(model, input) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const messages = input.messages || [{ role: 'user', content: input.input || input.prompt || '' }];

  // Convert messages to Gemini format
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: contents,
      generationConfig: {
        temperature: input.temperature || 0.7,
        maxOutputTokens: input.max_tokens || 1024
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callGitHub(model, input) {
  const apiKey = process.env.GITHUB_TOKEN;
  if (!apiKey) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model.id,
      messages: input.messages || [{ role: 'user', content: input.input || input.prompt || '' }],
      temperature: input.temperature || 0.7,
      max_tokens: input.max_tokens || 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub Models API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callCohere(model, input) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    throw new Error('COHERE_API_KEY not configured');
  }

  const messages = input.messages || [{ role: 'user', content: input.input || input.prompt || '' }];

  const response = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model.id,
      messages: messages,
      temperature: input.temperature || 0.7,
      max_tokens: input.max_tokens || 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callPerplexity(model, input) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model.id,
      messages: input.messages || [{ role: 'user', content: input.input || input.prompt || '' }],
      temperature: input.temperature || 0.7,
      max_tokens: input.max_tokens || 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${error}`);
  }

  return {
    data: await response.json(),
    headers: response.headers
  };
}

async function callPuter(model, input) {
  // Puter built-in AI - this uses the Puter SDK's ai.* functions
  // This is a placeholder for Puter SDK integration
  // In a real Puter app, this would use: puter.ai.chat() or puter.ai.txt2img() etc.

  if (typeof puter === 'undefined' || !puter.ai) {
    throw new Error('Puter SDK not available - this endpoint only works inside Puter environment');
  }

  const prompt = input.input || input.prompt ||
    (input.messages && input.messages[input.messages.length - 1]?.content) || '';

  // Determine which Puter AI function to call based on model capabilities
  if (model.capabilities?.images) {
    const result = await puter.ai.txt2img(prompt);
    return {
      data: {
        choices: [{ message: { content: result } }],
        usage: { total_tokens: 0 }
      },
      headers: new Headers()  // Puter SDK doesn't provide headers
    };
  } else {
    const result = await puter.ai.chat(prompt, {
      model: model.id,
      temperature: input.temperature || 0.7
    });
    return {
      data: {
        choices: [{ message: { content: result } }],
        usage: { total_tokens: 0 }
      },
      headers: new Headers()  // Puter SDK doesn't provide headers
    };
  }
}

async function callDirect(model, input) {
  // For direct API calls (OpenAI, Anthropic, Google, etc.)
  const provider = model.company;

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model.id,
        messages: input.messages || [{ role: 'user', content: input.input || input.prompt || '' }],
        temperature: input.temperature || 0.7,
        max_tokens: input.max_tokens || 1024
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    return {
      data: await response.json(),
      headers: response.headers
    };
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const messages = input.messages || [{ role: 'user', content: input.input || input.prompt || '' }];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model.id,
        messages: messages,
        max_tokens: input.max_tokens || 1024
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    return {
      data: await response.json(),
      headers: response.headers
    };
  }

  throw new Error(`Direct API for provider "${provider}" not yet implemented`);
}

async function callProvider(model, input) {
  const route = model.route || model.provider;
  const startTime = Date.now();
  let result;
  let success = true;
  let errorMessage = null;

  try {
    switch (route) {
      case 'groq':
        result = await callGroq(model, input);
        break;
      case 'mistral':
        result = await callMistral(model, input);
        break;
      case 'openrouter':
        result = await callOpenRouter(model, input);
        break;
      case 'cerebras':
        result = await callCerebras(model, input);
        break;
      case 'cloudflare':
        result = await callCloudflare(model, input);
        break;
      case 'huggingface':
        result = await callHuggingFace(model, input);
        break;
      case 'gemini':
        result = await callGemini(model, input);
        break;
      case 'github':
        result = await callGitHub(model, input);
        break;
      case 'cohere':
        result = await callCohere(model, input);
        break;
      case 'perplexity':
        result = await callPerplexity(model, input);
        break;
      case 'puter':
        result = await callPuter(model, input);
        break;
      case 'direct':
        result = await callDirect(model, input);
        break;
      default:
        throw new Error(`Provider route "${route}" not implemented`);
    }
  } catch (error) {
    success = false;
    errorMessage = error.message;
    throw error; // Re-throw after recording
  } finally {
    const latencyMs = Date.now() - startTime;
    recordProviderHealth(route, model.id, success, latencyMs, errorMessage);
  }

  // Parse and cache rate limit headers
  if (result.headers) {
    const limits = parseRateLimitHeaders(result.headers, route);
    const cacheKey = `${route}:${model.id}`;
    rateLimitCache[cacheKey] = {
      ...limits,
      updated_at: new Date().toISOString()
    };
  }

  return result.data;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

app.get('/models', (req, res) => {
  try {
    const db = loadDb();
    const models = buildModelList(db);
    const filtered = filterModels(models, {
      provider: req.query.provider,
      cost_tier: req.query.cost_tier,
      capability: req.query.capability
    });
    res.json({
      models: filtered,
      count: filtered.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/suggest-models', (req, res) => {
  try {
    const db = loadDb();
    let models = buildModelList(db);

    // Filter by boost_tier if specified
    const boostTier = req.body.boost_tier;
    if (boostTier) {
      const costTier = boostTierToCostTier(boostTier);
      if (!costTier) {
        return res.status(400).json({
          error: `Invalid boost_tier: ${boostTier}. Must be 'turbo' or 'ultra'.`
        });
      }
      models = models.filter(m => m.cost_tier === costTier);
    }

    const suggestions = suggestModels(models, {
      provider: req.body.provider,
      cost_tier: req.body.cost_tier || (boostTier ? boostTierToCostTier(boostTier) : undefined),
      capability: req.body.capability,
      max_cost_tier: req.body.max_cost_tier
    });
    res.json({
      models: suggestions,
      count: suggestions.length,
      boost_tier: boostTier || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function pickModel(models, input) {
  if (input.model_id) {
    return models.find((m) => m.id === input.model_id) || null;
  }
  const suggestions = suggestModels(models, {
    capability: input.capability,
    max_cost_tier: input.max_cost_tier
  });
  return suggestions[0] || null;
}

app.post('/run', async (req, res) => {
  const startTime = Date.now();

  try {
    const db = loadDb();
    let models = buildModelList(db);

    // Filter by boost_tier if specified
    const boostTier = req.body.boost_tier;
    if (boostTier) {
      const costTier = boostTierToCostTier(boostTier);
      if (!costTier) {
        return res.status(400).json({
          error: `Invalid boost_tier: ${boostTier}. Must be 'turbo' or 'ultra'.`
        });
      }
      models = models.filter(m => m.cost_tier === costTier);
    }

    const selected = pickModel(models, req.body || {});

    if (!selected) {
      return res.status(400).json({
        error: 'No model matched request',
        request: req.body,
        boost_tier: boostTier,
        available_models_count: models.length
      });
    }

    // Make actual provider call (rate limits are now automatically captured and cached)
    const providerResponse = await callProvider(selected, req.body);

    // Check boost tier exhaustion after call
    let exhaustionCheck = null;
    if (boostTier) {
      exhaustionCheck = await checkBoostTierExhaustion(boostTier, db);
    }

    res.json({
      model_id: selected.id,
      provider: selected.provider,
      route: selected.route,
      output: providerResponse.choices?.[0]?.message?.content ||
              providerResponse.content?.[0]?.text ||
              providerResponse,
      raw_provider_response: providerResponse,
      error: null,
      metadata: {
        cost_tier: selected.cost_tier,
        boost_tier: boostTier || null,
        execution_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        usage: providerResponse.usage || null,
        rate_limits: selected.limits || null
      },
      // Exhaustion signals
      boost_tier_exhausted: exhaustionCheck?.exhausted || false,
      boost_tier_message: exhaustionCheck?.message || null
    });
  } catch (error) {
    const isRateLimit = error.message.includes('rate') || error.message.includes('429') || error.message.includes('Rate');

    let suggestion = null;
    const selected = req.body.model_id ? models.find(m => m.id === req.body.model_id) : null;

    if (isRateLimit && selected) {
      // Find alternative model with same capability
      const capability = req.body.capability || 'chat';
      const alternatives = suggestModels(models, {
        capability: capability,
        max_cost_tier: req.body.max_cost_tier || 'remote_free'
      }).filter(m => m.id !== selected.id && m.provider !== selected.provider);

      if (alternatives.length > 0) {
        suggestion = {
          next_best_model: alternatives[0].id,
          next_best_provider: alternatives[0].provider,
          reason: 'Same capability, different provider'
        };
      }
    }

    res.status(isRateLimit ? 429 : 500).json({
      error: error.message,
      error_type: isRateLimit ? 'rate_limit_exceeded' : 'provider_error',
      provider: selected?.provider,
      model_id: selected?.id,
      retry_after_seconds: isRateLimit ? 60 : null,
      suggestion,
      metadata: {
        execution_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// ============================================================================
// ACCOUNT STATUS & PREFLIGHT - BOOST TIER EXHAUSTION DETECTION
// ============================================================================

// GET /account/status - Check account status for a boost tier
app.get('/account/status', async (req, res) => {
  try {
    const db = loadDb();
    const boostTier = req.query.boost_tier || 'turbo'; // Default to turbo

    // Check Puter credits if requested or if checking ultra tier
    let puterCredits = null;
    if (boostTier === 'ultra' || req.query.include_credits === 'true') {
      puterCredits = await getPuterCredits();
    }

    // Check exhaustion for the requested boost tier
    const tierStatus = await checkBoostTierExhaustion(boostTier, db);

    // Also check the other tier for comparison
    const otherTier = boostTier === 'turbo' ? 'ultra' : 'turbo';
    const otherTierStatus = await checkBoostTierExhaustion(otherTier, db);

    // Determine global account exhaustion (both tiers exhausted)
    const accountExhausted = tierStatus.exhausted && otherTierStatus.exhausted;

    res.json({
      puter_account: puterCredits?.username || 'unknown',
      puter_credits: puterCredits,
      boost_tier_requested: boostTier,
      boost_tier_status: tierStatus,
      other_tier_status: otherTierStatus,
      account_exhausted: accountExhausted,
      recommendation: accountExhausted
        ? 'All boost tiers exhausted. Log out of Puter and log into next account in rotation.'
        : tierStatus.exhausted
          ? `${boostTier} tier exhausted. Consider using ${otherTier} tier, or log out and switch accounts.`
          : `${boostTier} tier is still usable.`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /preflight - Check if a task can run with current account status
app.post('/preflight', async (req, res) => {
  try {
    const db = loadDb();
    const { boost_tier, task_type, capability, estimated_tokens } = req.body;

    if (!boost_tier) {
      return res.status(400).json({
        error: 'boost_tier is required (must be "turbo" or "ultra")'
      });
    }

    // Check boost tier exhaustion
    const tierStatus = await checkBoostTierExhaustion(boost_tier, db);

    if (!tierStatus.valid) {
      return res.status(400).json({
        error: tierStatus.error
      });
    }

    // Get models for this boost tier that match the capability
    const allModels = buildModelList(db);
    let candidateModels = allModels.filter(m =>
      m.cost_tier === tierStatus.cost_tier &&
      tierStatus.usable_model_ids.includes(m.id)
    );

    // Filter by capability if specified
    if (capability) {
      candidateModels = candidateModels.filter(m =>
        m.capabilities?.[capability] === true
      );
    }

    // Filter by task_type if specified
    if (task_type) {
      const taskCapabilityMap = {
        chat: 'chat',
        reasoning: 'reasoning',
        coding: 'coding',
        image_generation: 'images',
        speech: 'audio_speech',
        music: 'audio_music',
        vision: 'vision',
        video: 'video'
      };
      const requiredCap = taskCapabilityMap[task_type];
      if (requiredCap) {
        candidateModels = candidateModels.filter(m =>
          m.capabilities?.[requiredCap] === true
        );
      }
    }

    const canRun = candidateModels.length > 0;

    res.json({
      boost_tier: boost_tier,
      cost_tier: tierStatus.cost_tier,
      boost_tier_exhausted: tierStatus.exhausted,
      can_run: canRun,
      candidate_models: candidateModels.map(m => ({
        model_id: m.id,
        provider: m.provider,
        capabilities: m.capabilities,
        ratings: m.ratings
      })),
      suggested_model: candidateModels.length > 0
        ? candidateModels.sort((a, b) =>
          (b.ratings?.speed || 0) - (a.ratings?.speed || 0)
        )[0].id
        : null,
      message: !canRun
        ? tierStatus.message
        : `${candidateModels.length} model(s) available for this task in ${boost_tier} tier.`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/preflight/batch - Check if multiple tasks can run with current account status
app.post('/api/preflight/batch', async (req, res) => {
  try {
    const { boost_tier, tasks } = req.body;

    if (!boost_tier || !['turbo', 'ultra'].includes(boost_tier)) {
      return res.status(400).json({
        error: 'boost_tier is required and must be "turbo" or "ultra"'
      });
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        error: 'tasks must be a non-empty array'
      });
    }

    if (tasks.length > 20) {
      return res.status(400).json({
        error: 'Maximum 20 tasks per batch preflight check'
      });
    }

    const db = loadDb();
    const costTier = boostTierToCostTier(boost_tier);
    let allModels = buildModelList(db).filter(m => m.cost_tier === costTier);

    const results = [];
    let totalTokens = 0;

    // Track simulated consumption per provider during batch check
    const simulatedUsage = {};

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      totalTokens += task.estimated_tokens || 0;

      // Find candidate models for this task
      let candidates = allModels;

      if (task.model_id) {
        candidates = candidates.filter(m => m.id === task.model_id);
      }
      if (task.provider) {
        candidates = candidates.filter(m => m.provider === task.provider);
      }
      if (task.capability) {
        candidates = candidates.filter(m => m.capabilities?.[task.capability]);
      }

      // Sort by rating for the requested capability
      candidates = suggestModels(candidates, {
        capability: task.capability || 'chat',
        max_cost_tier: costTier
      });

      if (candidates.length === 0) {
        results.push({
          task_index: i,
          can_run: false,
          reason: `No ${task.capability || 'chat'} models available in ${boost_tier} tier` +
                  (task.provider ? ` from ${task.provider}` : ''),
          suggested_model: undefined,
          suggested_provider: undefined
        });
        continue;
      }

      // Check rate limits for top candidate
      let foundUsable = false;
      for (const candidate of candidates) {
        const cacheKey = `${candidate.provider}:${candidate.id}`;
        const cached = rateLimitCache[cacheKey];
        const staticLimits = candidate.limits || {};

        // Get current limits (prefer cached real-time data)
        const requestsRemaining = cached?.requests_remaining ?? staticLimits.rpm ?? 999;
        const tokensRemaining = cached?.tokens_remaining ?? staticLimits.tpm ?? 999999;

        // Account for simulated usage from earlier tasks in this batch
        const providerKey = candidate.provider;
        const simulated = simulatedUsage[providerKey] || { requests: 0, tokens: 0 };

        const effectiveRequestsRemaining = requestsRemaining - simulated.requests;
        const effectiveTokensRemaining = tokensRemaining - simulated.tokens;

        const taskTokens = task.estimated_tokens || 500; // Default estimate

        if (effectiveRequestsRemaining > 0 && effectiveTokensRemaining >= taskTokens) {
          // Can run - update simulated usage
          simulatedUsage[providerKey] = {
            requests: simulated.requests + 1,
            tokens: simulated.tokens + taskTokens
          };

          results.push({
            task_index: i,
            can_run: true,
            reason: task.model_id ? 'Requested model available' : 'Within rate limits',
            suggested_model: candidate.id,
            suggested_provider: candidate.provider
          });
          foundUsable = true;
          break;
        }
      }

      if (!foundUsable) {
        // All candidates exhausted - find alternative from different provider
        const exhaustedProviders = candidates.map(c => c.provider);
        const alternatives = allModels.filter(m =>
          !exhaustedProviders.includes(m.provider) &&
          m.capabilities?.[task.capability || 'chat']
        );

        const resetTime = rateLimitCache[`${candidates[0].provider}:${candidates[0].id}`]?.reset_time;
        const waitSeconds = resetTime ? Math.max(0, Math.ceil((new Date(resetTime).getTime() - Date.now()) / 1000)) : 60;

        results.push({
          task_index: i,
          can_run: false,
          reason: `Provider ${candidates[0].provider} rate limited`,
          suggested_model: alternatives[0]?.id,
          suggested_provider: alternatives[0]?.provider,
          estimated_wait_seconds: waitSeconds
        });
      }
    }

    const tasksRunnable = results.filter(r => r.can_run).length;
    const tasksBlocked = results.filter(r => !r.can_run).length;

    // Generate recommendation
    let recommendation = '';
    if (tasksBlocked === 0) {
      recommendation = `All ${tasks.length} tasks can run immediately.`;
    } else if (tasksRunnable === 0) {
      recommendation = `All tasks blocked. Consider switching boost tier or waiting for rate limits to reset.`;
    } else {
      const blockedWithAlt = results.filter(r => !r.can_run && r.suggested_provider);
      const minWait = Math.min(...results.filter(r => r.estimated_wait_seconds).map(r => r.estimated_wait_seconds));
      recommendation = `${tasksRunnable} of ${tasks.length} tasks can run immediately.`;
      if (blockedWithAlt.length > 0) {
        recommendation += ` ${blockedWithAlt.length} task(s) have alternative providers available.`;
      }
      if (minWait && minWait < 120) {
        recommendation += ` Wait ${minWait}s for rate limits to reset.`;
      }
    }

    res.json({
      batch_can_run: tasksBlocked === 0,
      tasks_runnable: tasksRunnable,
      tasks_blocked: tasksBlocked,
      total_estimated_tokens: totalTokens,
      results,
      recommendation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Turbo Console API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// PINOKIO DASHBOARD API - Model Metadata & Ratings
// ============================================================================

// Transform model object to Pinokio API format
function transformModelForPinokio(model, db) {
  const details = db.model_details?.[model.id] || {};
  const limits = model.limits || details.rate_limits || {};
  const overrides = ratingsOverrides[model.id] || {};

  return {
    model_id: model.id,
    display_name: details.display_name || model.id,
    provider_id: model.provider,
    family: model.company,
    modality: details.types || (model.capabilities?.chat ? ['chat'] : []),

    // Capabilities (boolean)
    supports_chat: Boolean(model.capabilities?.chat),
    supports_reasoning: Boolean(model.capabilities?.reasoning),
    supports_coding: Boolean(model.capabilities?.coding),
    supports_images: Boolean(model.capabilities?.images),
    supports_audio_speech: Boolean(model.capabilities?.audio_speech),
    supports_audio_music: Boolean(model.capabilities?.audio_music),
    supports_vision: Boolean(model.capabilities?.vision),
    supports_video: Boolean(model.capabilities?.video),

    // Ratings (0-5 stars, nullable) - apply overrides
    chat_rating: overrides.chat ?? model.ratings?.chat ?? null,
    reasoning_rating: overrides.reasoning ?? model.ratings?.reasoning ?? null,
    speed_rating: overrides.speed ?? model.ratings?.speed ?? null,
    coding_rating: overrides.coding ?? model.ratings?.coding ?? null,
    images_rating: overrides.images ?? model.ratings?.images ?? null,
    audio_speech_rating: overrides.audio_speech ?? model.ratings?.audio_speech ?? null,
    audio_music_rating: overrides.audio_music ?? model.ratings?.audio_music ?? null,
    vision_rating: overrides.vision ?? model.ratings?.vision ?? null,
    video_rating: overrides.video ?? model.ratings?.video ?? null,

    // Limits (nullable)
    requests_per_minute: limits.rpm ?? null,
    requests_per_day: limits.rpd ?? null,
    tokens_per_minute: limits.tpm ?? null,
    tokens_per_day: limits.tpd ?? null,
    tokens_per_month: limits.tpm_month ?? null,
    neurons_per_day: limits.neurons_per_day ?? null,
    audio_seconds_per_hour: limits.audio_seconds_per_hour ?? null,
    audio_seconds_per_day: limits.audio_seconds_per_day ?? null,

    // Cost tier
    cost_tier: model.cost_tier || 'paid',
    uses_puter_credits: Boolean(model.uses_puter_credits),

    // Metadata - apply notes override
    notes: overrides.notes ?? model.notes ?? details.cost_notes ?? '',
    limit_source: details.rate_limit_source || limits.source || null,
    limits_last_verified: details.last_updated || null
  };
}

// Filter models based on query parameters
function filterModelsPinokio(models, query) {
  return models.filter(model => {
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

    // Capability filters (requires_*)
    if (query.requires_chat === 'true' && !model.supports_chat) return false;
    if (query.requires_reasoning === 'true' && !model.supports_reasoning) return false;
    if (query.requires_coding === 'true' && !model.supports_coding) return false;
    if (query.requires_images === 'true' && !model.supports_images) return false;
    if (query.requires_audio_speech === 'true' && !model.supports_audio_speech) return false;
    if (query.requires_audio_music === 'true' && !model.supports_audio_music) return false;
    if (query.requires_vision === 'true' && !model.supports_vision) return false;
    if (query.requires_video === 'true' && !model.supports_video) return false;

    // Minimum rating filters
    const ratingFields = ['chat', 'reasoning', 'speed', 'coding', 'images', 'audio_speech', 'audio_music', 'vision', 'video'];
    for (const field of ratingFields) {
      const minRating = query[`min_${field}_rating`];
      if (minRating !== undefined) {
        const rating = model[`${field}_rating`];
        if (rating === null || rating < parseInt(minRating)) return false;
      }
    }

    return true;
  });
}

// Sort models based on query parameters
function sortModelsPinokio(models, sortBy, sortOrder = 'desc') {
  if (!sortBy) return models;

  const order = sortOrder === 'asc' ? 1 : -1;

  return [...models].sort((a, b) => {
    const aVal = a[sortBy] ?? -Infinity;
    const bVal = b[sortBy] ?? -Infinity;

    if (aVal === bVal) return 0;
    return (aVal > bVal ? 1 : -1) * order;
  });
}

// GET /api/models - List all models with metadata
app.get('/api/models', (req, res) => {
  try {
    const db = loadDb();
    const models = buildModelList(db);

    // Transform to Pinokio format
    let transformed = models.map(m => transformModelForPinokio(m, db));

    // Apply filters
    transformed = filterModelsPinokio(transformed, req.query);

    // Apply sorting
    transformed = sortModelsPinokio(transformed, req.query.sort_by, req.query.sort_order);

    res.json({
      models: transformed,
      count: transformed.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/models/presets - Pre-sliced views for dashboard
// IMPORTANT: This must come BEFORE /:model_id route to avoid matching "presets" as an ID
app.get('/api/models/presets', (req, res) => {
  try {
    const db = loadDb();
    const models = buildModelList(db);
    const transformed = models.map(m => transformModelForPinokio(m, db));

    // Filter to allowed cost tiers (default: remote_free and credit_backed)
    const allowedTiers = req.query.cost_tiers
      ? req.query.cost_tiers.split(',')
      : ['remote_free', 'credit_backed'];

    const filtered = transformed.filter(m => allowedTiers.includes(m.cost_tier));

    const topN = parseInt(req.query.top_n) || 10;

    const presets = {
      best_reasoning: sortModelsPinokio(
        filtered.filter(m => m.supports_reasoning && m.reasoning_rating !== null),
        'reasoning_rating',
        'desc'
      ).slice(0, topN),

      fastest_chat: sortModelsPinokio(
        filtered.filter(m => m.supports_chat && m.speed_rating !== null),
        'speed_rating',
        'desc'
      ).slice(0, topN),

      best_coding: sortModelsPinokio(
        filtered.filter(m => m.supports_coding && m.coding_rating !== null),
        'coding_rating',
        'desc'
      ).slice(0, topN),

      best_vision: sortModelsPinokio(
        filtered.filter(m => m.supports_vision && m.vision_rating !== null),
        'vision_rating',
        'desc'
      ).slice(0, topN),

      all_free_models: filtered.filter(m => m.cost_tier === 'remote_free')
    };

    res.json({
      presets,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/models/:model_id - Get single model metadata
app.get('/api/models/:model_id', (req, res) => {
  try {
    const db = loadDb();
    const models = buildModelList(db);
    const model = models.find(m => m.id === req.params.model_id);

    if (!model) {
      return res.status(404).json({
        error: 'Model not found',
        model_id: req.params.model_id
      });
    }

    res.json(transformModelForPinokio(model, db));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/models/:model_id/rating - Update model ratings
app.patch('/api/models/:model_id/rating', (req, res) => {
  try {
    const db = loadDb();
    const models = buildModelList(db);
    const model = models.find(m => m.id === req.params.model_id);

    if (!model) {
      return res.status(404).json({
        error: 'Model not found',
        model_id: req.params.model_id
      });
    }

    // Validate rating values
    const validRatingFields = ['chat', 'reasoning', 'speed', 'coding', 'images', 'audio_speech', 'audio_music', 'vision', 'video'];
    const updates = {};

    for (const field of validRatingFields) {
      const ratingKey = `${field}_rating`;
      if (req.body[ratingKey] !== undefined) {
        const value = parseInt(req.body[ratingKey]);
        if (isNaN(value) || value < 0 || value > 5) {
          return res.status(400).json({
            error: `Invalid rating value for ${ratingKey}. Must be integer 0-5.`,
            field: ratingKey,
            value: req.body[ratingKey]
          });
        }
        updates[field] = value;
      }
    }

    // Notes update
    if (req.body.notes !== undefined) {
      updates.notes = String(req.body.notes);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided',
        valid_fields: [...validRatingFields.map(f => `${f}_rating`), 'notes']
      });
    }

    // Update in-memory overrides
    ratingsOverrides[req.params.model_id] = {
      ...ratingsOverrides[req.params.model_id],
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Persist to disk
    try {
      saveRatingsOverrides(ratingsOverrides);
    } catch (e) {
      console.error('Failed to persist ratings:', e);
      return res.status(500).json({
        error: 'Failed to save ratings to disk',
        details: e.message
      });
    }

    res.json({
      success: true,
      model_id: req.params.model_id,
      updates: updates,
      persisted: true,
      message: 'Rating updated successfully and persisted to disk',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rate-limits - Get cached rate limits from recent provider calls
app.get('/api/rate-limits', (req, res) => {
  try {
    res.json({
      cache: rateLimitCache,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/providers/health - Get provider health status
app.get('/api/providers/health', (req, res) => {
  try {
    const db = loadDb();
    const allProviders = db.metadata.supported_providers;

    const providerHealth = allProviders.map(provider =>
      getProviderHealthStatus(provider, db)
    );

    // Generate summary
    const summary = {
      total_providers: providerHealth.length,
      healthy: providerHealth.filter(p => p.status === 'healthy').length,
      degraded: providerHealth.filter(p => p.status === 'degraded').length,
      down: providerHealth.filter(p => p.status === 'down').length,
      unknown: providerHealth.filter(p => p.status === 'unknown').length
    };

    res.json({
      providers: providerHealth,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Root endpoint with API documentation
app.get('/api', (req, res) => {
  res.json({
    service: 'Turbo Console API',
    version: '1.0.0',
    description: 'Machine-facing API helper for Pinokio routing to multiple AI providers',
    endpoints: {
      'GET /models': {
        description: 'List available models with optional filtering',
        query_params: {
          provider: 'Filter by provider (groq, mistral, openrouter, etc.)',
          cost_tier: 'Filter by cost tier (local, remote_free, credit_backed, paid)',
          capability: 'Filter by capability (chat, reasoning, coding, images, etc.)'
        }
      },
      'POST /suggest-models': {
        description: 'Get model suggestions based on task requirements',
        body: {
          capability: 'Required capability (chat, reasoning, coding, etc.)',
          max_cost_tier: 'Maximum acceptable cost tier',
          provider: 'Preferred provider (optional)'
        }
      },
      'POST /run': {
        description: 'Execute a model inference',
        body: {
          model_id: 'Specific model ID (optional if using suggestions)',
          capability: 'Task capability if model_id not specified',
          max_cost_tier: 'Max cost tier if auto-selecting model',
          input: 'Input text/prompt',
          messages: 'Chat messages array (alternative to input)',
          temperature: 'Temperature (0-2, default 0.7)',
          max_tokens: 'Max tokens to generate (default 1024)'
        }
      },
      'GET /health': {
        description: 'Health check endpoint'
      },
      'GET /api/models': {
        description: 'Pinokio Dashboard API - List all models with full metadata',
        query_params: {
          provider: 'Filter by provider',
          cost_tier: 'Filter by cost tier',
          requires_chat: 'Require chat capability (true/false)',
          requires_vision: 'Require vision capability (true/false)',
          min_reasoning_rating: 'Minimum reasoning rating (0-5)',
          sort_by: 'Sort field (e.g., reasoning_rating, speed_rating)',
          sort_order: 'Sort order (asc/desc)'
        }
      },
      'GET /api/models/:model_id': {
        description: 'Pinokio Dashboard API - Get single model metadata'
      },
      'GET /api/models/presets': {
        description: 'Pinokio Dashboard API - Pre-sliced views for dashboard',
        query_params: {
          cost_tiers: 'Allowed cost tiers (comma-separated)',
          top_n: 'Number of models per preset (default 10)'
        }
      },
      'PATCH /api/models/:model_id/rating': {
        description: 'Pinokio Dashboard API - Update model ratings',
        body: {
          chat_rating: 'Chat rating (0-5)',
          reasoning_rating: 'Reasoning rating (0-5)',
          notes: 'Free text notes'
        }
      }
    },
    environment_variables: {
      required: [
        'GROQ_API_KEY - For Groq provider',
        'OPENROUTER_API_KEY - For OpenRouter provider',
        'MISTRAL_API_KEY - For Mistral provider',
        'OPENAI_API_KEY - For OpenAI direct API',
        'ANTHROPIC_API_KEY - For Anthropic direct API'
      ],
      optional: [
        'PORT - Server port (default 8080)',
        'APP_URL - Application URL for OpenRouter'
      ]
    }
  });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           TURBO CONSOLE API SERVER                        ║
╠═══════════════════════════════════════════════════════════╣
║  Status: RUNNING                                          ║
║  Port: ${PORT}                                               ║
║  Endpoints:                                               ║
║    - GET  /api (API documentation)                        ║
║    - GET  /models (list models)                           ║
║    - POST /suggest-models (get suggestions)               ║
║    - POST /run (execute inference)                        ║
║    - GET  /health (health check)                          ║
╚═══════════════════════════════════════════════════════════╝

Machine-facing API helper for Pinokio routing.
Visit http://localhost:${PORT}/api for API documentation.
`);
});
