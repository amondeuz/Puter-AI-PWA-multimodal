import { Model, ProviderInput, ProviderResponse, HuggingFaceResponse } from '../types';
import { BaseProvider } from './base';
import { createHuggingFaceHeaders } from '../utils/headers';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * HuggingFace Inference API provider implementation
 */
export class HuggingFaceProvider extends BaseProvider {
  protected readonly name = 'huggingface';
  protected readonly envKey = 'HUGGINGFACE_API_KEY';

  async call(model: Model, input: ProviderInput): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    const headers = createHuggingFaceHeaders(apiKey);

    // HuggingFace uses a simpler format
    const prompt = input.input || input.prompt || '';
    const body = {
      inputs: prompt,
      parameters: {
        temperature: this.getTemperature(input),
        max_new_tokens: this.getMaxTokens(input),
      },
    };

    const url = `${PROVIDER_ENDPOINTS.huggingface}/${model.id}`;
    const response = await this.makeRequest(url, headers, body);

    if (!response.ok) {
      await this.handleErrorResponse(response, model);
    }

    const data = (await response.json()) as HuggingFaceResponse;

    return {
      data,
      headers: response.headers,
    };
  }
}

export const huggingfaceProvider = new HuggingFaceProvider();
