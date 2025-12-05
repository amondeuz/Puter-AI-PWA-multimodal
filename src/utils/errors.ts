/**
 * Base error class for Turbo Console
 */
export class TurboConsoleError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Validation error - 400 Bad Request
 */
export class ValidationError extends TurboConsoleError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      field: this.field,
      value: this.value,
    };
  }
}

/**
 * Not found error - 404 Not Found
 */
export class NotFoundError extends TurboConsoleError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, 404, 'NOT_FOUND');
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      resourceType: this.resourceType,
      resourceId: this.resourceId,
    };
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 */
export class RateLimitError extends TurboConsoleError {
  public readonly provider: string;
  public readonly retryAfterSeconds: number;
  public readonly suggestion?: {
    next_best_model: string;
    next_best_provider: string;
    reason: string;
  };

  constructor(
    provider: string,
    message: string,
    retryAfterSeconds: number = 60,
    suggestion?: { next_best_model: string; next_best_provider: string; reason: string }
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.provider = provider;
    this.retryAfterSeconds = retryAfterSeconds;
    this.suggestion = suggestion;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      error_type: 'rate_limit_exceeded',
      provider: this.provider,
      retry_after_seconds: this.retryAfterSeconds,
      suggestion: this.suggestion,
    };
  }
}

/**
 * Provider error - 502 Bad Gateway
 */
export class ProviderError extends TurboConsoleError {
  public readonly provider: string;
  public readonly modelId?: string;
  public readonly originalError?: string;

  constructor(provider: string, message: string, modelId?: string, originalError?: string) {
    super(message, 502, 'PROVIDER_ERROR');
    this.provider = provider;
    this.modelId = modelId;
    this.originalError = originalError;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      provider: this.provider,
      model_id: this.modelId,
      original_error: this.originalError,
    };
  }
}

/**
 * Configuration error - 500 Internal Server Error
 */
export class ConfigurationError extends TurboConsoleError {
  public readonly configKey: string;

  constructor(configKey: string, message?: string) {
    super(message || `${configKey} not configured`, 500, 'CONFIGURATION_ERROR');
    this.configKey = configKey;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      config_key: this.configKey,
    };
  }
}

/**
 * Check if an error is a rate limit error based on message content
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('rate') ||
         message.includes('429') ||
         message.includes('too many requests') ||
         message.includes('quota');
}

/**
 * Create an appropriate error from provider response
 */
export function createProviderError(
  provider: string,
  statusCode: number,
  message: string,
  modelId?: string
): TurboConsoleError {
  if (statusCode === 429 || isRateLimitError(new Error(message))) {
    return new RateLimitError(provider, message, 60);
  }
  return new ProviderError(provider, message, modelId);
}
