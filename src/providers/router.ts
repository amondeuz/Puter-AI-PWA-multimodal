import { Model, ProviderInput, RouteKey } from '../types';
import { ProviderError } from '../utils/errors';
import { healthService } from '../services/health';
import { rateLimitService } from '../services/rateLimit';
import { BaseProvider } from './base';
import { groqProvider } from './groq';
import { mistralProvider } from './mistral';
import { cerebrasProvider } from './cerebras';
import { perplexityProvider } from './perplexity';
import { githubProvider } from './github';
import { openaiProvider } from './openai';
import { openrouterProvider } from './openrouter';
import { anthropicProvider } from './anthropic';
import { geminiProvider } from './gemini';
import { cohereProvider } from './cohere';
import { cloudflareProvider } from './cloudflare';
import { huggingfaceProvider } from './huggingface';
import { puterProvider } from './puter';

/**
 * Provider registry mapping routes to providers
 */
const providerRegistry: Record<string, BaseProvider> = {
  groq: groqProvider,
  mistral: mistralProvider,
  cerebras: cerebrasProvider,
  perplexity: perplexityProvider,
  github: githubProvider,
  openai: openaiProvider,
  openrouter: openrouterProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  cohere: cohereProvider,
  cloudflare: cloudflareProvider,
  huggingface: huggingfaceProvider,
  puter: puterProvider,
};

/**
 * Direct API provider mapping (for direct_api route)
 */
const directProviderMap: Record<string, BaseProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
};

/**
 * Get the appropriate provider for a route
 */
export function getProvider(route: RouteKey | string, company?: string): BaseProvider {
  // Handle direct API routing
  if (route === 'direct' || route === 'direct_api') {
    if (!company) {
      throw new ProviderError('direct', 'Company must be specified for direct API calls');
    }
    const provider = directProviderMap[company];
    if (!provider) {
      throw new ProviderError('direct', `Direct API for provider "${company}" not yet implemented`);
    }
    return provider;
  }

  const provider = providerRegistry[route];
  if (!provider) {
    throw new ProviderError(route, `Provider route "${route}" not implemented`);
  }
  return provider;
}

/**
 * Call a provider and handle health/rate-limit tracking
 */
export async function callProvider(model: Model, input: ProviderInput): Promise<unknown> {
  const route = model.route || model.provider;
  const startTime = Date.now();
  let success = true;
  let errorMessage: string | null = null;

  try {
    const provider = getProvider(route, model.company);
    const result = await provider.call(model, input);

    // Parse and cache rate limit headers
    if (result.headers) {
      rateLimitService.updateFromHeaders(route, model.id, result.headers);
    }

    return result.data;
  } catch (error) {
    success = false;
    errorMessage = (error as Error).message;
    throw error;
  } finally {
    const latencyMs = Date.now() - startTime;
    healthService.recordCall(route, model.id, success, latencyMs, errorMessage);
  }
}

/**
 * Extract content from provider response
 */
export function extractContent(response: unknown): string {
  const res = response as Record<string, unknown>;

  // OpenAI-compatible format
  if (res.choices && Array.isArray(res.choices) && res.choices.length > 0) {
    const choice = res.choices[0] as Record<string, unknown>;
    if (choice.message && typeof choice.message === 'object') {
      const message = choice.message as Record<string, unknown>;
      return String(message.content || '');
    }
  }

  // Anthropic format
  if (res.content && Array.isArray(res.content) && res.content.length > 0) {
    const content = res.content[0] as Record<string, unknown>;
    return String(content.text || '');
  }

  // Gemini format
  if (res.candidates && Array.isArray(res.candidates) && res.candidates.length > 0) {
    const candidate = res.candidates[0] as Record<string, unknown>;
    if (candidate.content && typeof candidate.content === 'object') {
      const content = candidate.content as Record<string, unknown>;
      if (content.parts && Array.isArray(content.parts) && content.parts.length > 0) {
        const part = content.parts[0] as Record<string, unknown>;
        return String(part.text || '');
      }
    }
  }

  // Cohere format
  if (res.message && typeof res.message === 'object') {
    const message = res.message as Record<string, unknown>;
    if (message.content && Array.isArray(message.content) && message.content.length > 0) {
      const content = message.content[0] as Record<string, unknown>;
      return String(content.text || '');
    }
  }

  // Cloudflare format
  if (res.result && typeof res.result === 'object') {
    const result = res.result as Record<string, unknown>;
    return String(result.response || '');
  }

  // HuggingFace format
  if (res.generated_text) {
    return String(res.generated_text);
  }

  // Fallback - try to stringify
  return JSON.stringify(response);
}
