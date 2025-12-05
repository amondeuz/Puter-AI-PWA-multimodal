import { ModelDetails, ProviderName } from './models';

/**
 * Company entry in model registry
 */
export interface CompanyModels {
  direct_api?: string[];
  openrouter?: string[];
  togetherai?: string[];
  groq?: string[];
  mistral?: string[];
  cerebras?: string[];
  cloudflare?: string[];
  huggingface?: string[];
  gemini?: string[];
  github?: string[];
  cohere?: string[];
  perplexity?: string[];
  puter?: string[];
}

/**
 * Model registry structure
 */
export interface ModelRegistry {
  [companyKey: string]: CompanyModels;
}

/**
 * Database metadata
 */
export interface DatabaseMetadata {
  version: string;
  last_updated: string;
  supported_providers: ProviderName[];
  total_models?: number;
}

/**
 * Model details map
 */
export interface ModelDetailsMap {
  [modelId: string]: ModelDetails;
}

/**
 * Full database structure
 */
export interface Database {
  metadata: DatabaseMetadata;
  model_registry: ModelRegistry;
  model_details?: ModelDetailsMap;
  free_models?: string[];
}

/**
 * Ratings override entry
 */
export interface RatingsOverride {
  chat?: number;
  reasoning?: number;
  speed?: number;
  coding?: number;
  images?: number;
  audio_speech?: number;
  audio_music?: number;
  vision?: number;
  video?: number;
  notes?: string;
  updated_at?: string;
}

/**
 * Ratings overrides map
 */
export interface RatingsOverridesMap {
  [modelId: string]: RatingsOverride;
}
