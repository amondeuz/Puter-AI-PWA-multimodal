# Turbo Console API

**Machine-facing API helper for Pinokio routing to multiple AI providers**

## Overview

Turbo Console is a **programmatic API service** designed to be called by [Pinokio](https://pinokio.computer/) (your local AI stack). It acts as an aggregator and router for multiple free-tier and paid AI providers, allowing Pinokio to offload heavy tasks without managing individual provider APIs.

### Architecture

```
Pinokio (Local) → Turbo Console API (Remote) → Multiple Providers
                                               ├─ Groq (20 free models)
                                               ├─ Mistral (2 free models)
                                               ├─ Cerebras (3 free models)
                                               ├─ Cloudflare Workers AI (5+ free models)
                                               ├─ Gemini (2 free models)
                                               ├─ GitHub Models (9 free models)
                                               ├─ Hugging Face (many free models)
                                               ├─ Puter Built-in (credit-backed)
                                               ├─ OpenRouter (aggregation)
                                               ├─ OpenAI (paid)
                                               ├─ Anthropic (paid)
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

## Supported Providers

Turbo Console integrates **11 AI providers** with focus on free tiers:

### Free Tier Providers

1. **Groq** (20 free models)
   - Models: llama-3.1-8b-instant, llama-3.3-70b-versatile, whisper-large-v3, playai-tts, etc.
   - Rate limits: 30 req/min, 14400 req/day (varies by model)
   - Setup: `GROQ_API_KEY` from https://console.groq.com

2. **Mistral AI** (2 free models)
   - Models: mistral-small-latest, pixtral-12b-2409
   - Rate limits: Check https://console.mistral.ai
   - Setup: `MISTRAL_API_KEY` from https://console.mistral.ai

3. **Cerebras Inference** (3 free models)
   - Models: llama3.1-8b, llama3.1-70b, llama3.3-70b
   - Rate limits: Check https://cloud.cerebras.ai
   - Setup: `CEREBRAS_API_KEY` from https://cloud.cerebras.ai

4. **Cloudflare Workers AI** (5+ free models)
   - Models: @cf/meta/llama-3.1-8b-instruct, @cf/meta/llama-3.2-1b-instruct, etc.
   - Rate limits: 10,000 neurons/day
   - Setup: `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID`

5. **Google Gemini** (2 free models)
   - Models: gemini-2.0-flash-exp, gemini-1.5-flash
   - Rate limits: Check https://ai.google.dev/pricing
   - Setup: `GEMINI_API_KEY` from https://ai.google.dev

6. **GitHub Models** (9 free models - beta)
   - Models: gpt-4o, gpt-4o-mini, meta-llama-3.1-405b-instruct, mistral-large-2407, etc.
   - Rate limits: Free during beta
   - Setup: `GITHUB_TOKEN` from https://github.com/settings/tokens

7. **Hugging Face Inference** (many free models)
   - Models: Any model on HuggingFace with inference API enabled
   - Rate limits: Varies by model
   - Setup: `HUGGINGFACE_API_KEY` from https://huggingface.co

8. **Puter Built-in AI** (credit-backed)
   - Models: puter-chat, puter-txt2img, puter-completion
   - Cost: Uses Puter credits (free allocation included)
   - Setup: No API key needed (automatically available in Puter environment)

### Paid/Aggregation Providers

9. **OpenRouter** (aggregation - some free models)
   - Access to 100+ models via single API
   - Setup: `OPENROUTER_API_KEY` from https://openrouter.ai

10. **OpenAI** (paid)
    - Models: gpt-4o, gpt-4o-mini, etc.
    - Setup: `OPENAI_API_KEY` from https://platform.openai.com

11. **Anthropic** (paid)
    - Models: claude-sonnet-4.5, etc.
    - Setup: `ANTHROPIC_API_KEY` from https://console.anthropic.com

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

| Variable | Required | Provider | Description |
|----------|----------|----------|-------------|
| `GROQ_API_KEY` | Recommended | Groq | Free tier - 20 models |
| `MISTRAL_API_KEY` | Optional | Mistral | Free tier - 2 models |
| `CEREBRAS_API_KEY` | Optional | Cerebras | Free tier - 3 models |
| `CLOUDFLARE_API_KEY` | Optional | Cloudflare | Free tier - 10k neurons/day |
| `CLOUDFLARE_ACCOUNT_ID` | Optional | Cloudflare | Required with Cloudflare key |
| `GEMINI_API_KEY` | Optional | Google | Free tier - 2 Gemini models |
| `GITHUB_TOKEN` | Optional | GitHub | Free beta - 9 models |
| `HUGGINGFACE_API_KEY` | Optional | HuggingFace | Free inference API |
| `OPENROUTER_API_KEY` | Optional | OpenRouter | Aggregation platform |
| `OPENAI_API_KEY` | Optional | OpenAI | Paid tier |
| `ANTHROPIC_API_KEY` | Optional | Anthropic | Paid tier |
| `PORT` | Optional | Server | Server port (default 8080) |
| `APP_URL` | Optional | Server | App URL for OpenRouter |

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
