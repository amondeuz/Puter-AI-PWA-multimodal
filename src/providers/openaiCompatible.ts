import { Model, ProviderInput, ProviderResponse, OpenAICompatibleResponse } from '../types';
import { BaseProvider } from './base';
import { createOpenAIHeaders } from '../utils/headers';

/**
 * Base class for OpenAI-compatible providers
 * (Groq, Mistral, Cerebras, Perplexity, GitHub, OpenAI)
 */
export abstract class OpenAICompatibleProvider extends BaseProvider {
  protected abstract readonly endpoint: string;

  /**
   * Get the model ID to use in the request
   * Can be overridden by subclasses for model ID transformations
   */
  protected getModelId(model: Model): string {
    return model.id;
  }

  /**
   * Get headers for the request
   * Can be overridden by subclasses for custom headers
   */
  protected getHeaders(apiKey: string): Record<string, string> {
    return createOpenAIHeaders(apiKey);
  }

  /**
   * Build the request body
   * Can be overridden by subclasses for custom body fields
   */
  protected buildRequestBody(model: Model, input: ProviderInput): Record<string, unknown> {
    return {
      model: this.getModelId(model),
      messages: this.getMessages(input),
      temperature: this.getTemperature(input),
      max_tokens: this.getMaxTokens(input),
    };
  }

  /**
   * Call the OpenAI-compatible API
   */
  async call(model: Model, input: ProviderInput): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    const headers = this.getHeaders(apiKey);
    const body = this.buildRequestBody(model, input);

    const response = await this.makeRequest(this.endpoint, headers, body);

    if (!response.ok) {
      await this.handleErrorResponse(response, model);
    }

    const data = (await response.json()) as OpenAICompatibleResponse;

    return {
      data,
      headers: response.headers,
    };
  }
}
