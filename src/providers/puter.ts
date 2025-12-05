import { Model, ProviderInput, ProviderResponse, OpenAICompatibleResponse } from '../types';
import { BaseProvider } from './base';
import { ProviderError } from '../utils/errors';

// Declare Puter SDK types
declare const puter: {
  ai?: {
    chat: (prompt: string, options?: { model?: string; temperature?: number }) => Promise<string>;
    txt2img: (prompt: string) => Promise<string>;
  };
  auth?: {
    isSignedIn: () => Promise<boolean>;
    getUser: () => Promise<{ credits?: number; username?: string }>;
  };
};

/**
 * Puter built-in AI provider implementation
 * Uses the Puter SDK for AI operations
 */
export class PuterProvider extends BaseProvider {
  protected readonly name = 'puter';
  protected readonly envKey = 'PUTER_SDK'; // Not actually used, SDK is browser-based

  /**
   * Override getApiKey since Puter doesn't use API keys
   */
  protected getApiKey(): string {
    // Puter SDK doesn't need an API key
    return '';
  }

  async call(model: Model, input: ProviderInput): Promise<ProviderResponse> {
    // Check if Puter SDK is available
    if (typeof puter === 'undefined' || !puter.ai) {
      throw new ProviderError(
        'puter',
        'Puter SDK not available - this endpoint only works inside Puter environment',
        model.id
      );
    }

    const messages = this.getMessages(input);
    const prompt = messages[messages.length - 1]?.content || '';

    let result: string;

    // Determine which Puter AI function to call based on model capabilities
    if (model.capabilities?.images) {
      result = await puter.ai.txt2img(prompt);
    } else {
      result = await puter.ai.chat(prompt, {
        model: model.id,
        temperature: this.getTemperature(input),
      });
    }

    // Wrap result in OpenAI-compatible format
    const data: OpenAICompatibleResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: result,
          },
        },
      ],
      usage: {
        total_tokens: 0,
      },
    };

    return {
      data,
      headers: new Headers(), // Puter SDK doesn't provide headers
    };
  }
}

export const puterProvider = new PuterProvider();

/**
 * Get Puter credits status
 */
export async function getPuterCredits(): Promise<{
  available: boolean;
  balance: number | null;
  username?: string;
  error: string | null;
}> {
  try {
    if (typeof puter === 'undefined' || !puter.auth) {
      return {
        available: false,
        balance: null,
        error: 'Puter SDK not available - not running inside Puter environment',
      };
    }

    const isSignedIn = await puter.auth.isSignedIn();
    if (!isSignedIn) {
      return {
        available: false,
        balance: null,
        error: 'No Puter user signed in',
      };
    }

    const user = await puter.auth.getUser();

    return {
      available: true,
      balance: user.credits || 0,
      username: user.username,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      balance: null,
      error: (error as Error).message,
    };
  }
}
