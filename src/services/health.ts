import { ProviderHealthRecord, ProviderHealthStatus, Database } from '../types';
import { MAX_HISTORY_PER_PROVIDER } from '../utils/constants';
import { buildModelList } from './models';

/**
 * Service for tracking provider health
 */
class HealthService {
  private history: Record<string, ProviderHealthRecord[]> = {};

  /**
   * Record a provider call result
   */
  recordCall(provider: string, modelId: string, success: boolean, latencyMs: number, errorMessage: string | null): void {
    if (!this.history[provider]) {
      this.history[provider] = [];
    }

    this.history[provider].push({
      model_id: modelId,
      success,
      latency_ms: latencyMs,
      error_message: errorMessage,
      timestamp: new Date().toISOString(),
    });

    // Keep only last MAX_HISTORY_PER_PROVIDER entries
    if (this.history[provider].length > MAX_HISTORY_PER_PROVIDER) {
      this.history[provider].shift();
    }
  }

  /**
   * Get health status for a provider
   */
  getProviderStatus(provider: string, db: Database): ProviderHealthStatus {
    const history = this.history[provider] || [];

    if (history.length === 0) {
      return {
        provider,
        status: 'unknown',
        latency_ms: null,
        last_checked: null,
        last_success: null,
        last_error: null,
        error_count_last_hour: 0,
        success_rate_last_hour: null,
        models_available: buildModelList(db).filter((m) => m.provider === provider).length,
      };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentHistory = history.filter((h) => new Date(h.timestamp) > oneHourAgo);
    const lastCall = history[history.length - 1];
    const lastSuccess = [...history].reverse().find((h) => h.success);

    const successCount = recentHistory.filter((h) => h.success).length;
    const totalCount = recentHistory.length;
    const successRate = totalCount > 0 ? successCount / totalCount : null;
    const errorCount = recentHistory.filter((h) => !h.success).length;

    // Calculate average latency from successful calls
    const successfulCalls = recentHistory.filter((h) => h.success && h.latency_ms);
    const avgLatency =
      successfulCalls.length > 0
        ? Math.round(successfulCalls.reduce((sum, h) => sum + h.latency_ms, 0) / successfulCalls.length)
        : null;

    // Determine status
    let status: 'healthy' | 'degraded' | 'down' | 'unknown' = 'unknown';
    if (totalCount > 0) {
      if (successRate !== null && successRate >= 0.95 && (avgLatency === null || avgLatency < 2000)) {
        status = 'healthy';
      } else if (successRate !== null && successRate >= 0.5 && (avgLatency === null || avgLatency < 5000)) {
        status = 'degraded';
      } else {
        status = 'down';
      }

      // Check if last success was too long ago
      if (lastSuccess) {
        const lastSuccessTime = new Date(lastSuccess.timestamp).getTime();
        const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
        if (lastSuccessTime < fifteenMinutesAgo && totalCount > 5) {
          status = 'down';
        }
      }
    }

    return {
      provider,
      status,
      latency_ms: avgLatency,
      last_checked: lastCall?.timestamp || null,
      last_success: lastSuccess?.timestamp || null,
      last_error: lastCall?.success === false ? lastCall.error_message : null,
      error_count_last_hour: errorCount,
      success_rate_last_hour: successRate,
      models_available: buildModelList(db).filter((m) => m.provider === provider).length,
    };
  }

  /**
   * Get health status for all providers
   */
  getAllProvidersStatus(providers: string[], db: Database): ProviderHealthStatus[] {
    return providers.map((provider) => this.getProviderStatus(provider, db));
  }

  /**
   * Get raw history for a provider
   */
  getHistory(provider: string): ProviderHealthRecord[] {
    return this.history[provider] || [];
  }

  /**
   * Clear history for a provider
   */
  clearHistory(provider: string): void {
    delete this.history[provider];
  }

  /**
   * Clear all history
   */
  clearAllHistory(): void {
    this.history = {};
  }
}

// Export singleton instance
export const healthService = new HealthService();

// Export class for testing
export { HealthService };
