import { Model } from '../types';
import { OpenAICompatibleProvider } from './openaiCompatible';
import { createOpenRouterHeaders } from '../utils/headers';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * OpenRouter provider implementation
 * Requires custom headers for HTTP-Referer and X-Title
 */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  protected readonly name = 'openrouter';
  protected readonly envKey = 'OPENROUTER_API_KEY';
  protected readonly endpoint = PROVIDER_ENDPOINTS.openrouter;

  /**
   * Get custom headers for OpenRouter
   */
  protected getHeaders(apiKey: string): Record<string, string> {
    const appUrl = process.env.APP_URL;
    return createOpenRouterHeaders(apiKey, appUrl);
  }

  /**
   * Remove 'openrouter:' prefix from model ID if present
   */
  protected getModelId(model: Model): string {
    return model.id.replace('openrouter:', '');
  }
}

export const openrouterProvider = new OpenRouterProvider();
