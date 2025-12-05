import { Model, ProviderInput, ProviderResponse, CloudflareResponse } from '../types';
import { BaseProvider } from './base';
import { createCloudflareHeaders } from '../utils/headers';
import { ConfigurationError } from '../utils/errors';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * Cloudflare Workers AI provider implementation
 */
export class CloudflareProvider extends BaseProvider {
  protected readonly name = 'cloudflare';
  protected readonly envKey = 'CLOUDFLARE_API_KEY';

  /**
   * Get Cloudflare account ID from environment
   */
  private getAccountId(): string {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      throw new ConfigurationError('CLOUDFLARE_ACCOUNT_ID');
    }
    return accountId;
  }

  async call(model: Model, input: ProviderInput): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    const accountId = this.getAccountId();
    const headers = createCloudflareHeaders(apiKey);
    const messages = this.getMessages(input);

    const body = {
      messages,
      temperature: this.getTemperature(input),
      max_tokens: this.getMaxTokens(input),
    };

    const url = `${PROVIDER_ENDPOINTS.cloudflare}/${accountId}/ai/run/${model.id}`;
    const response = await this.makeRequest(url, headers, body);

    if (!response.ok) {
      await this.handleErrorResponse(response, model);
    }

    const data = (await response.json()) as CloudflareResponse;

    return {
      data,
      headers: response.headers,
    };
  }
}

export const cloudflareProvider = new CloudflareProvider();
