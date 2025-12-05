import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api - API documentation
 */
router.get('/api', (_req: Request, res: Response) => {
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
          capability: 'Filter by capability (chat, reasoning, coding, images, etc.)',
        },
      },
      'POST /suggest-models': {
        description: 'Get model suggestions based on task requirements',
        body: {
          capability: 'Required capability (chat, reasoning, coding, etc.)',
          max_cost_tier: 'Maximum acceptable cost tier',
          provider: 'Preferred provider (optional)',
        },
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
          max_tokens: 'Max tokens to generate (default 1024)',
        },
      },
      'GET /health': {
        description: 'Health check endpoint',
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
          sort_order: 'Sort order (asc/desc)',
        },
      },
      'GET /api/models/:model_id': {
        description: 'Pinokio Dashboard API - Get single model metadata',
      },
      'GET /api/models/presets': {
        description: 'Pinokio Dashboard API - Pre-sliced views for dashboard',
        query_params: {
          cost_tiers: 'Allowed cost tiers (comma-separated)',
          top_n: 'Number of models per preset (default 10)',
        },
      },
      'PATCH /api/models/:model_id/rating': {
        description: 'Pinokio Dashboard API - Update model ratings',
        body: {
          chat_rating: 'Chat rating (0-5)',
          reasoning_rating: 'Reasoning rating (0-5)',
          notes: 'Free text notes',
        },
      },
    },
    environment_variables: {
      required: [
        'GROQ_API_KEY - For Groq provider',
        'OPENROUTER_API_KEY - For OpenRouter provider',
        'MISTRAL_API_KEY - For Mistral provider',
        'OPENAI_API_KEY - For OpenAI direct API',
        'ANTHROPIC_API_KEY - For Anthropic direct API',
      ],
      optional: [
        'PORT - Server port (default 8080)',
        'APP_URL - Application URL for OpenRouter',
      ],
    },
  });
});

export default router;
