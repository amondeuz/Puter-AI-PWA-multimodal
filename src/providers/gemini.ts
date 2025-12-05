import { Model, ProviderInput, ProviderResponse, GeminiResponse } from '../types';
import { BaseProvider } from './base';
import { createGeminiHeaders } from '../utils/headers';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * Gemini provider implementation
 */
export class GeminiProvider extends BaseProvider {
  protected readonly name = 'gemini';
  protected readonly envKey = 'GEMINI_API_KEY';

  async call(model: Model, input: ProviderInput): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    const headers = createGeminiHeaders();
    const messages = this.getMessages(input);

    // Convert messages to Gemini format
    const contents = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const body = {
      contents,
      generationConfig: {
        temperature: this.getTemperature(input),
        maxOutputTokens: this.getMaxTokens(input),
      },
    };

    // Gemini uses query param for API key
    const url = `${PROVIDER_ENDPOINTS.gemini}/${model.id}:generateContent?key=${apiKey}`;
    const response = await this.makeRequest(url, headers, body);

    if (!response.ok) {
      await this.handleErrorResponse(response, model);
    }

    const data = (await response.json()) as GeminiResponse;

    return {
      data,
      headers: response.headers,
    };
  }
}

export const geminiProvider = new GeminiProvider();
