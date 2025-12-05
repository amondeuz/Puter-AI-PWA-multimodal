import { OpenAICompatibleProvider } from './openaiCompatible';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * Mistral provider implementation
 */
export class MistralProvider extends OpenAICompatibleProvider {
  protected readonly name = 'mistral';
  protected readonly envKey = 'MISTRAL_API_KEY';
  protected readonly endpoint = PROVIDER_ENDPOINTS.mistral;
}

export const mistralProvider = new MistralProvider();
