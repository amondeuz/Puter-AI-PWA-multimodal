import { OpenAICompatibleProvider } from './openaiCompatible';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * Groq provider implementation
 */
export class GroqProvider extends OpenAICompatibleProvider {
  protected readonly name = 'groq';
  protected readonly envKey = 'GROQ_API_KEY';
  protected readonly endpoint = PROVIDER_ENDPOINTS.groq;
}

export const groqProvider = new GroqProvider();
