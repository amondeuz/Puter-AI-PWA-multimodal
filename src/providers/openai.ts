import { OpenAICompatibleProvider } from './openaiCompatible';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  protected readonly name = 'openai';
  protected readonly envKey = 'OPENAI_API_KEY';
  protected readonly endpoint = PROVIDER_ENDPOINTS.openai;
}

export const openaiProvider = new OpenAIProvider();
