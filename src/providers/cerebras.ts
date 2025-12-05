import { OpenAICompatibleProvider } from './openaiCompatible';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * Cerebras provider implementation
 */
export class CerebrasProvider extends OpenAICompatibleProvider {
  protected readonly name = 'cerebras';
  protected readonly envKey = 'CEREBRAS_API_KEY';
  protected readonly endpoint = PROVIDER_ENDPOINTS.cerebras;
}

export const cerebrasProvider = new CerebrasProvider();
