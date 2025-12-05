import { OpenAICompatibleProvider } from './openaiCompatible';
import { PROVIDER_ENDPOINTS } from '../utils/constants';

/**
 * GitHub Models provider implementation
 */
export class GitHubProvider extends OpenAICompatibleProvider {
  protected readonly name = 'github';
  protected readonly envKey = 'GITHUB_TOKEN';
  protected readonly endpoint = PROVIDER_ENDPOINTS.github;
}

export const githubProvider = new GitHubProvider();
