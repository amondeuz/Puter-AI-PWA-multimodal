# Pinokio Dashboard API Documentation

**Turbo Console - Model Metadata & Ratings API**

This API exposes comprehensive model metadata and ratings from Turbo Console to enable Pinokio to build a dashboard for comparing, filtering, and selecting AI models.

## Design Principles

- **Read-only by default** - Model metadata endpoints are stateless and read-only
- **Stable field names** - JSON response schemas are stable and will not be casually renamed
- **No secrets** - API responses never include API keys or tokens
- **Nullable fields** - Missing information returns `null` instead of invented values
- **Fast & pure** - Metadata endpoints make no external provider calls

## Base URL

```
http://localhost:8080
```

## Endpoints

### 1. List All Models with Metadata

**Endpoint:** `GET /api/models`

**Purpose:** Retrieve complete list of models with full metadata for dashboard display.

**Query Parameters:**

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `provider` | string | Filter by provider ID | `groq`, `mistral`, `cerebras` |
| `cost_tier` | string | Filter by cost tier | `remote_free`, `credit_backed`, `paid` |
| `requires_chat` | boolean | Require chat capability | `true`, `false` |
| `requires_reasoning` | boolean | Require reasoning capability | `true`, `false` |
| `requires_coding` | boolean | Require coding capability | `true`, `false` |
| `requires_images` | boolean | Require image generation | `true`, `false` |
| `requires_audio_speech` | boolean | Require speech/TTS | `true`, `false` |
| `requires_audio_music` | boolean | Require music generation | `true`, `false` |
| `requires_vision` | boolean | Require vision/image understanding | `true`, `false` |
| `requires_video` | boolean | Require video capability | `true`, `false` |
| `min_chat_rating` | integer | Minimum chat rating (0-5) | `3` |
| `min_reasoning_rating` | integer | Minimum reasoning rating (0-5) | `4` |
| `min_speed_rating` | integer | Minimum speed rating (0-5) | `4` |
| `min_coding_rating` | integer | Minimum coding rating (0-5) | `3` |
| `min_images_rating` | integer | Minimum images rating (0-5) | `3` |
| `min_audio_speech_rating` | integer | Minimum audio_speech rating (0-5) | `3` |
| `min_audio_music_rating` | integer | Minimum audio_music rating (0-5) | `3` |
| `min_vision_rating` | integer | Minimum vision rating (0-5) | `3` |
| `min_video_rating` | integer | Minimum video rating (0-5) | `3` |
| `sort_by` | string | Field to sort by | `reasoning_rating`, `speed_rating`, `coding_rating` |
| `sort_order` | string | Sort order | `asc`, `desc` (default) |

**Example Requests:**

```bash
# Get all free tier models
curl "http://localhost:8080/api/models?cost_tier=remote_free"

# Get all models with chat and vision, sorted by reasoning rating
curl "http://localhost:8080/api/models?requires_chat=true&requires_vision=true&sort_by=reasoning_rating"

# Get all coding models with at least 3 stars, sorted by speed
curl "http://localhost:8080/api/models?requires_coding=true&min_coding_rating=3&sort_by=speed_rating&sort_order=desc"

# Get all Groq models
curl "http://localhost:8080/api/models?provider=groq"
```

**Response Schema:**

```json
{
  "models": [
    {
      "model_id": "llama-3.1-8b-instant",
      "display_name": "Llama 3.1 8B Instant",
      "provider_id": "groq",
      "family": "groq",
      "modality": ["chat"],

      "supports_chat": true,
      "supports_reasoning": true,
      "supports_coding": true,
      "supports_images": false,
      "supports_audio_speech": false,
      "supports_audio_music": false,
      "supports_vision": false,
      "supports_video": false,

      "chat_rating": 3,
      "reasoning_rating": 2,
      "speed_rating": 5,
      "coding_rating": 3,
      "images_rating": 0,
      "audio_speech_rating": 0,
      "audio_music_rating": 0,
      "vision_rating": 0,
      "video_rating": 0,

      "requests_per_minute": 30,
      "requests_per_day": 14400,
      "tokens_per_minute": 6000,
      "tokens_per_day": 500000,
      "tokens_per_month": null,
      "neurons_per_day": null,
      "audio_seconds_per_hour": null,
      "audio_seconds_per_day": null,

      "cost_tier": "remote_free",
      "uses_puter_credits": false,

      "notes": "",
      "limit_source": "https://console.groq.com/docs/rate-limits",
      "limits_last_verified": "2025-12-04"
    }
  ],
  "count": 1,
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Field Descriptions:**

- `model_id` - Unique model identifier (string)
- `display_name` - Human-readable model name (string)
- `provider_id` - Provider identifier (string: groq, mistral, cerebras, cloudflare, gemini, github, huggingface, puter, openrouter, openai, anthropic)
- `family` - Model family/company (string)
- `modality` - Array of modality types (array: ["chat"], ["image"], etc.)
- `supports_*` - Boolean capability flags (boolean)
- `*_rating` - Star ratings 0-5, or null if not rated (integer | null)
- `requests_per_minute` - RPM limit (integer | null)
- `requests_per_day` - RPD limit (integer | null)
- `tokens_per_minute` - TPM limit (integer | null)
- `tokens_per_day` - TPD limit (integer | null)
- `tokens_per_month` - Monthly token limit (integer | null)
- `neurons_per_day` - Cloudflare-specific: neurons per day (integer | null)
- `audio_seconds_per_hour` - Audio processing limit per hour (integer | null)
- `audio_seconds_per_day` - Audio processing limit per day (integer | null)
- `cost_tier` - Cost tier (string: local, remote_free, credit_backed, paid)
- `uses_puter_credits` - Whether model uses Puter credits (boolean)
- `notes` - Free text notes (string)
- `limit_source` - URL or description of where limits are documented (string | null)
- `limits_last_verified` - Date limits were last verified (string | null)

---

### 2. Get Single Model Metadata

**Endpoint:** `GET /api/models/:model_id`

**Purpose:** Retrieve detailed metadata for a specific model.

**Path Parameters:**

- `model_id` - Model identifier (e.g., `llama-3.1-8b-instant`)

**Example Requests:**

```bash
# Get metadata for Llama 3.1 8B
curl "http://localhost:8080/api/models/llama-3.1-8b-instant"

# Get metadata for Gemini
curl "http://localhost:8080/api/models/gemini-2.0-flash-exp"
```

**Success Response (200):**

Same schema as a single model object from the list endpoint.

**Error Response (404):**

```json
{
  "error": "Model not found",
  "model_id": "invalid-model-id"
}
```

---

### 3. Get Dashboard Presets

**Endpoint:** `GET /api/models/presets`

**Purpose:** Retrieve pre-sliced views optimized for common dashboard use cases.

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `cost_tiers` | string | Comma-separated list of allowed cost tiers | `remote_free,credit_backed` |
| `top_n` | integer | Number of models per preset | `10` |

**Example Requests:**

```bash
# Get presets with default settings
curl "http://localhost:8080/api/models/presets"

# Get top 5 models from only free tier
curl "http://localhost:8080/api/models/presets?cost_tiers=remote_free&top_n=5"

# Include all cost tiers
curl "http://localhost:8080/api/models/presets?cost_tiers=local,remote_free,credit_backed,paid&top_n=15"
```

**Response Schema:**

```json
{
  "presets": {
    "best_reasoning": [
      { /* model object */ },
      { /* model object */ }
    ],
    "fastest_chat": [
      { /* model object */ },
      { /* model object */ }
    ],
    "best_coding": [
      { /* model object */ },
      { /* model object */ }
    ],
    "best_vision": [
      { /* model object */ },
      { /* model object */ }
    ],
    "all_free_models": [
      { /* model object */ },
      { /* model object */ }
    ]
  },
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Preset Descriptions:**

- `best_reasoning` - Top N models sorted by `reasoning_rating` (descending)
- `fastest_chat` - Top N models sorted by `speed_rating` (descending)
- `best_coding` - Top N models sorted by `coding_rating` (descending)
- `best_vision` - Top N models sorted by `vision_rating` (descending)
- `all_free_models` - All models with `cost_tier === 'remote_free'`

---

### 4. Update Model Ratings

**Endpoint:** `PATCH /api/models/:model_id/rating`

**Purpose:** Update star ratings or notes for a model (for manual curation from Pinokio dashboard).

**Path Parameters:**

- `model_id` - Model identifier

**Request Body:**

```json
{
  "chat_rating": 4,
  "reasoning_rating": 5,
  "speed_rating": 3,
  "coding_rating": 4,
  "images_rating": 0,
  "audio_speech_rating": 0,
  "audio_music_rating": 0,
  "vision_rating": 0,
  "video_rating": 0,
  "notes": "Excellent for reasoning tasks, moderate speed"
}
```

**Validation Rules:**

- All `*_rating` fields must be integers 0-5
- `notes` is a string (any length)
- At least one field must be provided
- Only provided fields are updated

**Example Requests:**

```bash
# Update chat and reasoning ratings
curl -X PATCH "http://localhost:8080/api/models/llama-3.1-8b-instant/rating" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_rating": 4,
    "reasoning_rating": 3,
    "notes": "Fast and reliable for general chat"
  }'

# Update just the notes
curl -X PATCH "http://localhost:8080/api/models/gemini-2.0-flash-exp/rating" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Experimental model, excellent reasoning"
  }'
```

**Success Response (200):**

```json
{
  "success": true,
  "model_id": "llama-3.1-8b-instant",
  "updates": {
    "chat": 4,
    "reasoning": 3,
    "notes": "Fast and reliable for general chat"
  },
  "message": "Rating updated successfully (in-memory only - not persisted to disk yet)",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Error Response (400 - Invalid Rating):**

```json
{
  "error": "Invalid rating value for reasoning_rating. Must be integer 0-5.",
  "field": "reasoning_rating",
  "value": 7
}
```

**Error Response (400 - No Updates):**

```json
{
  "error": "No valid updates provided",
  "valid_fields": [
    "chat_rating",
    "reasoning_rating",
    "speed_rating",
    "coding_rating",
    "images_rating",
    "audio_speech_rating",
    "audio_music_rating",
    "vision_rating",
    "video_rating",
    "notes"
  ]
}
```

**Error Response (404):**

```json
{
  "error": "Model not found",
  "model_id": "invalid-model-id"
}
```

**Important Notes:**

- **Persistence:** Currently, rating updates are in-memory only and will not survive server restart
- **Future:** Persistence will be implemented to write back to `model-company-database-v3-complete.json`
- **Thread Safety:** No concurrent update protection yet - last write wins

---

## Common Use Cases

### Build a Model Comparison Dashboard

```javascript
// Fetch all models
const response = await fetch('http://localhost:8080/api/models');
const { models } = await response.json();

// Display in a table with columns:
// - Model Name
// - Provider
// - Cost Tier
// - Capabilities (chat, vision, coding, etc.)
// - Ratings (reasoning, speed, coding)
// - Rate Limits
```

### Filter Models for a Specific Task

```javascript
// Find all free coding models with at least 3 stars for coding
const response = await fetch(
  'http://localhost:8080/api/models?' +
  'cost_tier=remote_free&' +
  'requires_coding=true&' +
  'min_coding_rating=3&' +
  'sort_by=speed_rating&' +
  'sort_order=desc'
);
const { models } = await response.json();
```

### Get Quick Dashboard Views

```javascript
// Get preset views for dashboard widgets
const response = await fetch('http://localhost:8080/api/models/presets?top_n=5');
const { presets } = await response.json();

// Display widgets:
// - "Top 5 Reasoning Models" - presets.best_reasoning
// - "Fastest Chat Models" - presets.fastest_chat
// - "Best for Coding" - presets.best_coding
// - "All Free Models" - presets.all_free_models
```

### Update Model Ratings from Dashboard

```javascript
// User adjusts ratings in Pinokio UI
const updates = {
  reasoning_rating: 4,
  speed_rating: 5,
  notes: 'Excellent performance on reasoning benchmarks'
};

await fetch('http://localhost:8080/api/models/llama-3.1-8b-instant/rating', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updates)
});
```

---

## Backward Compatibility

The original Turbo Console API endpoints remain unchanged:

- `GET /models` - Original model listing (simpler format)
- `POST /suggest-models` - Model suggestion engine
- `POST /run` - Model inference execution
- `GET /health` - Health check

The new Pinokio Dashboard API (`/api/models/*`) supplements these without breaking existing functionality.

---

## Error Handling

All endpoints return proper HTTP status codes:

- **200 OK** - Successful request
- **400 Bad Request** - Invalid query parameters or request body
- **404 Not Found** - Model ID not found
- **500 Internal Server Error** - Server-side error

Error responses always include an `error` field with a human-readable message.

---

## Performance Notes

- All metadata endpoints are **read-only** and make **no external API calls**
- Data is loaded from the model database JSON file on each request
- Response times are typically < 50ms for full model listings
- No rate limiting is applied to metadata endpoints
- For production deployments, consider adding caching headers

---

## Future Enhancements

- **Persistence for ratings** - Save PATCH updates back to database JSON
- **Model benchmarks** - Add benchmark scores from public leaderboards
- **Usage statistics** - Track model usage frequency from `/run` endpoint
- **Custom tags** - Allow Pinokio to tag models with custom labels
- **Comparison endpoint** - Side-by-side comparison of multiple models
