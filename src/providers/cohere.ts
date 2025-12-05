import { Model, ProviderInput, ProviderResponse, CohereResponse } from '../types';
import { BaseProvider } from './base';
import { createCohereHeaders } from '../utils/headers';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * Cohere provider implementation
 */
export class CohereProvider extends BaseProvider {
  protected readonly name = 'cohere';
  protected readonly envKey = 'COHERE_API_KEY';

  async call(model: Model, input: ProviderInput): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    const headers = createCohereHeaders(apiKey);
    const messages = this.getMessages(input);

    const body = {
      model: model.id,
      messages,
      temperature: this.getTemperature(input),
      max_tokens: this.getMaxTokens(input),
    };

    const response = await this.makeRequest(PROVIDER_ENDPOINTS.cohere, headers, body);

    if (!response.ok) {
      await this.handleErrorResponse(response, model);
    }

    const data = (await response.json()) as CohereResponse;

    return {
      data,
      headers: response.headers,
    };
  }
}

export const cohereProvider = new CohereProvider();
