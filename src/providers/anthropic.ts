import { Model, ProviderInput, ProviderResponse, AnthropicResponse } from '../types';
import { BaseProvider } from './base';
import { createAnthropicHeaders } from '../utils/headers';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * Anthropic provider implementation
 */
export class AnthropicProvider extends BaseProvider {
  protected readonly name = 'anthropic';
  protected readonly envKey = 'ANTHROPIC_API_KEY';

  async call(model: Model, input: ProviderInput): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    const headers = createAnthropicHeaders(apiKey);
    const messages = this.getMessages(input);

    const body = {
      model: model.id,
      messages,
      max_tokens: this.getMaxTokens(input),
    };

    const response = await this.makeRequest(PROVIDER_ENDPOINTS.anthropic, headers, body);

    if (!response.ok) {
      await this.handleErrorResponse(response, model);
    }

    const data = (await response.json()) as AnthropicResponse;

    return {
      data,
      headers: response.headers,
    };
  }
}

export const anthropicProvider = new AnthropicProvider();
