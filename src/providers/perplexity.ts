import { OpenAICompatibleProvider } from './openaiCompatible';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * Perplexity provider implementation
 */
export class PerplexityProvider extends OpenAICompatibleProvider {
  protected readonly name = 'perplexity';
  protected readonly envKey = 'PERPLEXITY_API_KEY';
  protected readonly endpoint = PROVIDER_ENDPOINTS.perplexity;
}

export const perplexityProvider = new PerplexityProvider();
