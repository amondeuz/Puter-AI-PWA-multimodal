# Account Exhaustion & Boost Tier System

**Turbo Console - Account Rotation & Quota Management**

This document describes how Turbo Console detects account exhaustion and manages separate "boost tiers" for free-only and credit-backed models.

## Design Principles

1. **Single Puter account** - Turbo Console assumes exactly one Puter OS account is logged in at any time
2. **No internal rotation** - Turbo Console does NOT switch accounts automatically
3. **Manual rotation** - User manually logs out of Puter and logs into next account when exhausted
4. **Real API usage** - Uses Puter credits API and provider rate limit headers when available
5. **Separate boost tiers** - "Turbo" (free) and "Ultra Turbo" (credit-backed) are distinct lanes
6. **Clear signaling** - Returns structured exhaustion signals to caller (Pinokio)

## Boost Tiers

Turbo Console organizes remote models into two boost tiers:

### Turbo (Free-Only)

- **Cost Tier:** `remote_free`
- **Models:** All free-tier models from providers (Groq, Mistral, Cerebras, Cloudflare, Gemini, GitHub, etc.)
- **Cost:** No cost per call under current Puter account
- **Exhaustion:** Detected via provider rate limit APIs and response headers

**Example Models:**
- `llama-3.1-8b-instant` (Groq)
- `mistral-small-latest` (Mistral)
- `llama3.1-8b` (Cerebras)
- `gemini-2.0-flash-exp` (Gemini)
- `gpt-4o-mini` (GitHub Models)

### Ultra Turbo (Credit-Backed)

- **Cost Tier:** `credit_backed`
- **Models:** Models that consume Puter credits
- **Cost:** Deducts from Puter account credit balance
- **Exhaustion:** Detected when Puter credit balance reaches 0

**Example Models:**
- `puter-chat` (Puter built-in)
- `puter-txt2img` (Puter built-in)

### Important: No Blended Mode

There is **NO** automatic fallback between boost tiers. The caller (Pinokio) must explicitly choose:

- `boost_tier: "turbo"` → Use ONLY free-tier models
- `boost_tier: "ultra"` → Use ONLY credit-backed models

This prevents surprise credit consumption and gives user full control over when to use paid resources.

---

## Exhaustion Detection

### For Turbo (Free-Tier Models)

Exhaustion is detected using:

1. **Provider Rate Limit Headers** (Primary)
   - Parse `x-ratelimit-remaining-requests` from API responses
   - Parse `x-ratelimit-remaining-tokens` from API responses
   - Cache these values in `rateLimitCache` for subsequent checks

2. **Static DB Limits** (Fallback)
   - Use rate limit values from `model-company-database-v3-complete.json`
   - Apply local counters if no API data available

**Turbo Exhaustion = All free-tier models have hit their rate limits**

### For Ultra Turbo (Credit-Backed Models)

Exhaustion is detected using:

1. **Puter Credits API** (Primary)
   - Call `puter.auth.getUser()` to get current credit balance
   - Check if `user.credits > 0`

**Ultra Turbo Exhaustion = Puter credit balance is 0**

### Global Account Exhaustion

**Account Exhausted = Both Turbo AND Ultra Turbo are exhausted**

When global exhaustion occurs, user should log out of Puter OS and log into next account in rotation.

---

## API Endpoints

### 1. GET /account/status

Check account status for a specific boost tier.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `boost_tier` | string | No | `turbo` | Boost tier to check (`turbo` or `ultra`) |
| `include_credits` | boolean | No | `false` | Include Puter credit balance in response |

**Example Requests:**

```bash
# Check turbo tier status
curl "http://localhost:8080/account/status?boost_tier=turbo"

# Check ultra tier status with credits
curl "http://localhost:8080/account/status?boost_tier=ultra&include_credits=true"
```

**Response Schema:**

```json
{
  "puter_account": "user@example.com",
  "puter_credits": {
    "available": true,
    "balance": 100,
    "username": "user@example.com",
    "error": null
  },
  "boost_tier_requested": "turbo",
  "boost_tier_status": {
    "boost_tier": "turbo",
    "cost_tier": "remote_free",
    "valid": true,
    "exhausted": false,
    "total_models": 40,
    "usable_models": 35,
    "unusable_models": 5,
    "usable_model_ids": ["llama-3.1-8b-instant", "..."],
    "unusable_model_ids": ["model-x", "..."],
    "unusable_reasons": [
      {
        "model_id": "model-x",
        "provider": "groq",
        "reason": "Rate limit exhausted for groq - 0 requests remaining"
      }
    ],
    "message": "35 of 40 turbo models are still usable."
  },
  "other_tier_status": {
    "boost_tier": "ultra",
    "cost_tier": "credit_backed",
    "exhausted": false,
    "total_models": 3,
    "usable_models": 3,
    "message": "3 of 3 ultra models are still usable."
  },
  "account_exhausted": false,
  "recommendation": "turbo tier is still usable.",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Exhausted Example:**

```json
{
  "boost_tier_status": {
    "boost_tier": "turbo",
    "exhausted": true,
    "total_models": 40,
    "usable_models": 0,
    "unusable_models": 40,
    "message": "All eligible turbo models are exhausted for this Puter account. Please log out of Puter OS and log into the next account in your rotation if you want to continue using this tier."
  },
  "account_exhausted": false,
  "recommendation": "turbo tier exhausted. Consider using ultra tier, or log out and switch accounts."
}
```

---

### 2. POST /preflight

Check if a task can run with current account status before actually running it.

**Request Body:**

```json
{
  "boost_tier": "turbo",
  "task_type": "chat",
  "capability": "reasoning",
  "estimated_tokens": 1000
}
```

**Body Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `boost_tier` | string | **Yes** | Boost tier (`turbo` or `ultra`) |
| `task_type` | string | No | Task type (chat, reasoning, coding, image_generation, speech, music, vision, video) |
| `capability` | string | No | Required capability (chat, reasoning, coding, images, etc.) |
| `estimated_tokens` | integer | No | Estimated token usage (for future quota checks) |

**Example Requests:**

```bash
# Check if turbo tier can run a reasoning task
curl -X POST "http://localhost:8080/preflight" \
  -H "Content-Type: application/json" \
  -d '{
    "boost_tier": "turbo",
    "task_type": "reasoning"
  }'

# Check if ultra tier can run image generation
curl -X POST "http://localhost:8080/preflight" \
  -H "Content-Type: application/json" \
  -d '{
    "boost_tier": "ultra",
    "capability": "images"
  }'
```

**Response Schema:**

```json
{
  "boost_tier": "turbo",
  "cost_tier": "remote_free",
  "boost_tier_exhausted": false,
  "can_run": true,
  "candidate_models": [
    {
      "model_id": "llama-3.1-8b-instant",
      "provider": "groq",
      "capabilities": {
        "chat": true,
        "reasoning": true,
        "coding": true
      },
      "ratings": {
        "reasoning": 2,
        "speed": 5,
        "coding": 3
      }
    }
  ],
  "suggested_model": "llama-3.1-8b-instant",
  "message": "3 model(s) available for this task in turbo tier.",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Exhausted Example:**

```json
{
  "boost_tier": "turbo",
  "boost_tier_exhausted": true,
  "can_run": false,
  "candidate_models": [],
  "suggested_model": null,
  "message": "All eligible turbo models are exhausted for this Puter account. Please log out of Puter OS and log into the next account in your rotation if you want to continue using this tier."
}
```

---

### 3. POST /run (Updated)

Execute a model inference with boost tier filtering and exhaustion detection.

**Request Body:**

```json
{
  "boost_tier": "turbo",
  "capability": "chat",
  "input": "Hello, how are you?",
  "temperature": 0.7,
  "max_tokens": 1024
}
```

**New Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `boost_tier` | string | No | Filter to specific boost tier (`turbo` or `ultra`) |

**Response Schema:**

```json
{
  "model_id": "llama-3.1-8b-instant",
  "provider": "groq",
  "route": "groq",
  "output": "I'm doing well, thank you for asking!",
  "raw_provider_response": { ... },
  "error": null,
  "metadata": {
    "cost_tier": "remote_free",
    "boost_tier": "turbo",
    "execution_time_ms": 450,
    "timestamp": "2025-12-04T12:00:00.000Z",
    "usage": {
      "prompt_tokens": 10,
      "completion_tokens": 15,
      "total_tokens": 25
    },
    "rate_limits": null
  },
  "boost_tier_exhausted": false,
  "boost_tier_message": "35 of 40 turbo models are still usable."
}
```

**After-Exhaustion Example:**

```json
{
  "model_id": "llama-3.1-8b-instant",
  "output": "Response text...",
  "boost_tier_exhausted": true,
  "boost_tier_message": "All eligible turbo models are exhausted for this Puter account. Please log out of Puter OS and log into the next account in your rotation if you want to continue using this tier."
}
```

**Pinokio should watch for `boost_tier_exhausted: true` and prompt user to switch accounts.**

---

### 4. POST /suggest-models (Updated)

Get model suggestions with boost tier filtering.

**Request Body:**

```json
{
  "boost_tier": "turbo",
  "capability": "reasoning",
  "max_cost_tier": "remote_free"
}
```

**New Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `boost_tier` | string | No | Filter to specific boost tier |

**Response Schema:**

```json
{
  "models": [
    {
      "id": "llama-3.1-8b-instant",
      "provider": "groq",
      "cost_tier": "remote_free",
      "capabilities": { ... },
      "ratings": { ... }
    }
  ],
  "count": 5,
  "boost_tier": "turbo",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

---

## Implementation Details

### Puter Credits API

```javascript
async function getPuterCredits() {
  if (typeof puter === 'undefined' || !puter.auth) {
    return {
      available: false,
      error: 'Puter SDK not available'
    };
  }

  const isSignedIn = await puter.auth.isSignedIn();
  if (!isSignedIn) {
    return {
      available: false,
      error: 'No Puter user signed in'
    };
  }

  const user = await puter.auth.getUser();
  return {
    available: true,
    balance: user.credits || 0,
    username: user.username
  };
}
```

### Rate Limit Header Parsing

```javascript
function parseRateLimitHeaders(headers, provider) {
  const limits = {
    requests_remaining: null,
    requests_limit: null,
    tokens_remaining: null,
    tokens_limit: null,
    reset_time: null
  };

  // Parse x-ratelimit-remaining-requests
  // Parse x-ratelimit-remaining-tokens
  // Store in rateLimitCache

  return limits;
}
```

### Model Usability Check

```javascript
async function isModelUsable(model, db) {
  // For credit-backed models
  if (model.uses_puter_credits || model.cost_tier === 'credit_backed') {
    const credits = await getPuterCredits();
    if (!credits.available || credits.balance <= 0) {
      return { usable: false, reason: 'Puter credits exhausted' };
    }
    return { usable: true, reason: 'Puter credits available' };
  }

  // For free-tier models
  const rateLimits = rateLimitCache[`${model.provider}:${model.id}`];
  if (rateLimits && rateLimits.requests_remaining <= 0) {
    return { usable: false, reason: 'Rate limit exhausted' };
  }

  return { usable: true, reason: 'No exhaustion detected' };
}
```

---

## Pinokio Integration

### Workflow

1. **Before Task:** Call `/preflight` to check if boost tier can handle task
2. **Execute Task:** Call `/run` with `boost_tier` parameter
3. **After Task:** Check `boost_tier_exhausted` in response
4. **If Exhausted:** Show message to user prompting account switch
5. **Account Switch:** User logs out of Puter OS and logs into next account
6. **Resume:** Pinokio continues with new account

### Example Pinokio Code

```javascript
async function executeTask(task, boostTier = 'turbo') {
  // Preflight check
  const preflightResponse = await fetch('http://localhost:8080/preflight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boost_tier: boostTier,
      task_type: task.type,
      capability: task.capability
    })
  });

  const preflight = await preflightResponse.json();

  if (!preflight.can_run) {
    // Boost tier exhausted
    showAccountSwitchPrompt(preflight.message);
    return;
  }

  // Execute task
  const runResponse = await fetch('http://localhost:8080/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boost_tier: boostTier,
      capability: task.capability,
      input: task.input
    })
  });

  const result = await runResponse.json();

  // Check for exhaustion after run
  if (result.boost_tier_exhausted) {
    showAccountSwitchPrompt(result.boost_tier_message);
  }

  return result;
}

function showAccountSwitchPrompt(message) {
  console.warn(message);
  // Show UI prompt:
  // "Account exhausted. Please log out of Puter OS and log into your next account."
  // Pause further tasks until user confirms account switch
}
```

---

## Rate Limit Cache

In-memory cache of rate limit data from recent API calls:

```javascript
const rateLimitCache = {
  "groq:llama-3.1-8b-instant": {
    requests_remaining: 25,
    requests_limit: 30,
    tokens_remaining: 5500,
    tokens_limit: 6000,
    reset_time: "2025-12-04T13:00:00Z"
  },
  "mistral:mistral-small-latest": {
    requests_remaining: 0,  // EXHAUSTED
    requests_limit: 10,
    reset_time: "2025-12-04T12:30:00Z"
  }
};
```

**Note:** Cache is in-memory and will be lost on server restart. Future versions may persist this data.

---

## Future Enhancements

1. **Persistent Rate Limit Tracking**
   - Store rate limit cache in Puter KV store
   - Survive server restarts

2. **Rate Limit Reset Timers**
   - Automatically mark models as usable again after reset time
   - Show "available in X minutes" for exhausted models

3. **Provider-Specific Quota Endpoints**
   - Call Groq `/v1/usage` endpoint for accurate quota data
   - Call Mistral usage API
   - Integrate with each provider's official usage tracking

4. **Smart Account Rotation Suggestions**
   - Track which models are exhausted
   - Suggest optimal time to switch accounts
   - Estimate remaining capacity per boost tier

5. **Multi-Account Coordination**
   - External service to coordinate multiple Turbo Console instances
   - Share rate limit data across accounts
   - Intelligent load balancing

---

## Error Handling

All endpoints return clear error messages:

```json
{
  "error": "Invalid boost_tier: premium. Must be 'turbo' or 'ultra'."
}
```

```json
{
  "error": "boost_tier is required (must be \"turbo\" or \"ultra\")"
}
```

```json
{
  "error": "Cannot verify Puter credits: Puter SDK not available - not running inside Puter environment"
}
```

---

## Testing

### Test Turbo Tier Status

```bash
curl "http://localhost:8080/account/status?boost_tier=turbo"
```

### Test Ultra Tier Status

```bash
curl "http://localhost:8080/account/status?boost_tier=ultra&include_credits=true"
```

### Test Preflight

```bash
curl -X POST "http://localhost:8080/preflight" \
  -H "Content-Type: application/json" \
  -d '{"boost_tier":"turbo","task_type":"chat"}'
```

### Test Run with Boost Tier

```bash
curl -X POST "http://localhost:8080/run" \
  -H "Content-Type: application/json" \
  -d '{
    "boost_tier": "turbo",
    "capability": "chat",
    "input": "Hello!"
  }'
```

---

## Summary

- **Turbo (free)** and **Ultra Turbo (credit-backed)** are separate lanes
- No automatic fallback between tiers
- Exhaustion detected via real APIs (Puter credits, provider rate limits)
- Clear signaling when account needs to be switched
- User manually rotates accounts when exhausted
- Pinokio controls which tier to use via `boost_tier` parameter
