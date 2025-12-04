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

  return await response.json();
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

  return await response.json();
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

  return await response.json();
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

  return await response.json();
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

  return await response.json();
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

  return await response.json();
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

  return await response.json();
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

  return await response.json();
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
      choices: [{ message: { content: result } }],
      usage: { total_tokens: 0 }
    };
  } else {
    const result = await puter.ai.chat(prompt, {
      model: model.id,
      temperature: input.temperature || 0.7
    });
    return {
      choices: [{ message: { content: result } }],
      usage: { total_tokens: 0 }
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

    return await response.json();
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

    return await response.json();
  }

  throw new Error(`Direct API for provider "${provider}" not yet implemented`);
}

async function callProvider(model, input) {
  const route = model.route || model.provider;

  switch (route) {
    case 'groq':
      return await callGroq(model, input);
    case 'mistral':
      return await callMistral(model, input);
    case 'openrouter':
      return await callOpenRouter(model, input);
    case 'cerebras':
      return await callCerebras(model, input);
    case 'cloudflare':
      return await callCloudflare(model, input);
    case 'huggingface':
      return await callHuggingFace(model, input);
    case 'gemini':
      return await callGemini(model, input);
    case 'github':
      return await callGitHub(model, input);
    case 'puter':
      return await callPuter(model, input);
    case 'direct':
      return await callDirect(model, input);
    default:
      throw new Error(`Provider route "${route}" not implemented`);
  }
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
    const models = buildModelList(db);
    const suggestions = suggestModels(models, {
      provider: req.body.provider,
      cost_tier: req.body.cost_tier,
      capability: req.body.capability,
      max_cost_tier: req.body.max_cost_tier
    });
    res.json({
      models: suggestions,
      count: suggestions.length,
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
    const models = buildModelList(db);
    const selected = pickModel(models, req.body || {});

    if (!selected) {
      return res.status(400).json({
        error: 'No model matched request',
        request: req.body
      });
    }

    // Make actual provider call
    const providerResponse = await callProvider(selected, req.body);

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
        execution_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        usage: providerResponse.usage || null,
        rate_limits: selected.limits || null
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      metadata: {
        execution_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
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
