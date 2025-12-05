import { Model, ProviderInput, ProviderResponse, ChatMessage } from '../types';
import { ConfigurationError, createProviderError } from '../utils/errors';
import { DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from '../utils/constants';

/**
 * Base provider class with shared logic
 */
export abstract class BaseProvider {
  protected abstract readonly name: string;
  protected abstract readonly envKey: string;

  /**
   * Get API key from environment
   */
  protected getApiKey(): string {
    const apiKey = process.env[this.envKey];
    if (!apiKey) {
      throw new ConfigurationError(this.envKey);
    }
    return apiKey;
  }

  /**
   * Extract messages from input
   */
  protected getMessages(input: ProviderInput): ChatMessage[] {
    if (input.messages && input.messages.length > 0) {
      return input.messages;
    }

    const content = input.input || input.prompt || '';
    return [{ role: 'user', content }];
  }

  /**
   * Get temperature from input or use default
   */
  protected getTemperature(input: ProviderInput): number {
    return input.temperature ?? DEFAULT_TEMPERATURE;
  }

  /**
   * Get max tokens from input or use default
   */
  protected getMaxTokens(input: ProviderInput): number {
    return input.max_tokens ?? DEFAULT_MAX_TOKENS;
  }

  /**
   * Make HTTP request to provider API
   */
  protected async makeRequest(
    url: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<Response> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return response;
  }

  /**
   * Handle error response from provider
   */
  protected async handleErrorResponse(response: Response, model: Model): Promise<never> {
    const errorText = await response.text();
    throw createProviderError(
      this.name,
      response.status,
      `${this.name} API error: ${response.status} - ${errorText}`,
      model.id
    );
  }

  /**
   * Call the provider API - must be implemented by subclasses
   */
  abstract call(model: Model, input: ProviderInput): Promise<ProviderResponse>;

  /**
   * Get provider name
   */
  getName(): string {
    return this.name;
  }
}
