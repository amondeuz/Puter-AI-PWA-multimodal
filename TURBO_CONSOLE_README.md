# Turbo Console API

**Machine-facing API helper for Pinokio routing to multiple AI providers**

## Overview

Turbo Console is a **programmatic API service** designed to be called by [Pinokio](https://pinokio.computer/) (your local AI stack). It acts as an aggregator and router for multiple free-tier and paid AI providers, allowing Pinokio to offload heavy tasks without managing individual provider APIs.

### Architecture

```
Pinokio (Local) → Turbo Console API (Remote) → Multiple Providers
                                               ├─ Groq (20 free models)
                                               ├─ OpenRouter
                                               ├─ Mistral
                                               ├─ OpenAI
                                               ├─ Anthropic
                                               └─ ...
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

```bash
cp .env.example .env
# Edit .env and add your API keys
```

**Minimum configuration** (for free tier):
```env
GROQ_API_KEY=your_groq_api_key_here
```

Get a free Groq API key: https://console.groq.com

### 3. Start the Server

```bash
npm start
```

Server runs on `http://localhost:8080`

## API Endpoints

### GET /models

List available models with optional filtering.

**Query Parameters:**
- `provider` - Filter by provider (groq, mistral, openrouter, etc.)
- `cost_tier` - Filter by cost tier (local, remote_free, credit_backed, paid)
- `capability` - Filter by capability (chat, reasoning, coding, images, etc.)

**Example:**
```bash
curl "http://localhost:8080/models?provider=groq&cost_tier=remote_free"
```

**Response:**
```json
{
  "models": [
    {
      "id": "llama-3.1-8b-instant",
      "provider": "groq",
      "company": "groq",
      "route": "groq",
      "capabilities": {
        "chat": true,
        "reasoning": true,
        "coding": true,
        ...
      },
      "ratings": {
        "chat": 3,
        "reasoning": 2,
        "speed": 5,
        ...
      },
      "limits": {
        "rpm": 30,
        "rpd": 14400,
        "tpm": 6000,
        "tpd": 500000
      },
      "cost_tier": "remote_free"
    }
  ],
  "count": 20
}
```

### POST /suggest-models

Get model suggestions based on task requirements.

**Request Body:**
```json
{
  "capability": "chat",
  "max_cost_tier": "remote_free",
  "provider": "groq"
}
```

**Response:**
```json
{
  "models": [
    {
      "id": "llama-3.3-70b-versatile",
      "provider": "groq",
      "score": 4,
      "cost_tier": "remote_free",
      ...
    }
  ]
}
```

### POST /run

Execute a model inference.

**Request Body (with specific model):**
```json
{
  "model_id": "llama-3.1-8b-instant",
  "input": "Explain quantum computing in simple terms",
  "temperature": 0.7,
  "max_tokens": 500
}
```

**Request Body (auto-select model):**
```json
{
  "capability": "reasoning",
  "max_cost_tier": "remote_free",
  "messages": [
    {"role": "user", "content": "Solve this problem: ..."}
  ]
}
```

**Response:**
```json
{
  "model_id": "llama-3.1-8b-instant",
  "provider": "groq",
  "route": "groq",
  "output": "Quantum computing is...",
  "raw_provider_response": {...},
  "error": null,
  "metadata": {
    "cost_tier": "remote_free",
    "execution_time_ms": 1234,
    "timestamp": "2025-12-04T...",
    "usage": {
      "prompt_tokens": 15,
      "completion_tokens": 120,
      "total_tokens": 135
    }
  }
}
```

## Pinokio Integration

### Example Pinokio Script

```json
{
  "run": [
    {
      "method": "shell.run",
      "params": {
        "message": "curl -X POST http://localhost:8080/run -H 'Content-Type: application/json' -d '{\"capability\": \"chat\", \"max_cost_tier\": \"remote_free\", \"input\": \"Hello from Pinokio!\"}'"
      }
    }
  ]
}
```

### Using with Node.js in Pinokio

```javascript
const response = await fetch('http://localhost:8080/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    capability: 'reasoning',
    max_cost_tier: 'remote_free',
    input: 'Your prompt here'
  })
});

const result = await response.json();
console.log(result.output);
```

## Cost Tiers

Models are organized by cost tier:

1. **`local`** - Runs on your hardware (Pinokio manages these)
2. **`remote_free`** - Free tier with rate limits (e.g., Groq's 20 models)
3. **`credit_backed`** - Uses Puter credits or similar free allowances
4. **`paid`** - Requires payment per use

The `/suggest-models` endpoint automatically prefers cheaper tiers.

## Free Tier Models (Groq)

Turbo Console includes **20 free models** via Groq:

- **Chat:** llama-3.1-8b-instant, llama-3.3-70b-versatile, groq/compound, etc.
- **Speech-to-Text:** whisper-large-v3, whisper-large-v3-turbo
- **Text-to-Speech:** playai-tts, playai-tts-arabic
- **Reasoning:** Various Llama 4 and Kimi models

Rate limits apply (e.g., 30 req/min, 14400 req/day for Llama 3.1).

## Model Metadata

Each model includes:

- **Capabilities** (boolean flags): chat, reasoning, coding, images, audio, vision, video
- **Ratings** (0-5 stars): Quality ratings for each capability
- **Rate Limits**: rpm, rpd, tpm, tpd with source documentation
- **Cost Tier**: Preference ordering for auto-selection
- **Provider Info**: Routing and API details

## Database Updates

The model database (`model-company-database-v3-complete.json`) includes:

- **free_models**: List of free tier model IDs
- **pricing_registry**: Per-provider pricing ($/1M tokens)
- **model_registry**: Company → models mapping
- **model_details**: Per-model capabilities, ratings, limits

You can extend this database with additional providers and models.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes (for free tier) | Groq API key |
| `OPENROUTER_API_KEY` | Optional | OpenRouter API key |
| `MISTRAL_API_KEY` | Optional | Mistral AI API key |
| `OPENAI_API_KEY` | Optional | OpenAI API key |
| `ANTHROPIC_API_KEY` | Optional | Anthropic API key |
| `PORT` | Optional | Server port (default 8080) |
| `APP_URL` | Optional | App URL for OpenRouter |

## Testing

### Quick Test

```bash
# List free models
curl "http://localhost:8080/models?cost_tier=remote_free"

# Get suggestions
curl -X POST http://localhost:8080/suggest-models \
  -H "Content-Type: application/json" \
  -d '{"capability":"chat","max_cost_tier":"remote_free"}'

# Run inference
curl -X POST http://localhost:8080/run \
  -H "Content-Type: application/json" \
  -d '{"model_id":"llama-3.1-8b-instant","input":"Hello!"}'
```

## Deployment

### Local (for Pinokio)

```bash
npm start
# Pinokio calls http://localhost:8080/run
```

### Remote (Puter, Cloudflare, etc.)

Deploy to any Node.js hosting:
- Puter OS (up to 100MB storage)
- Cloudflare Workers
- Vercel, Railway, Render, etc.

Update Pinokio to call your remote URL.

## Error Handling

Errors return:
```json
{
  "error": "Error message",
  "metadata": {
    "execution_time_ms": 123,
    "timestamp": "2025-12-04T..."
  }
}
```

Common errors:
- `No model matched request` - Invalid model_id or constraints too restrictive
- `PROVIDER_API_KEY not configured` - Missing API key in .env
- `Provider API error: 429` - Rate limit exceeded

## Support

- **Model Database**: `model-company-database-v3-complete.json`
- **Server Code**: `server.js`
- **API Docs**: GET `/api` endpoint

## License

MIT
