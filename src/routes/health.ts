import { Router, Request, Response } from 'express';
import { databaseService } from '../services/database';
import { healthService } from '../services/health';
import { rateLimitService } from '../services/rateLimit';

const router = Router();

/**
 * GET /health - Basic health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Turbo Console API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/rate-limits - Get cached rate limits
 */
router.get('/api/rate-limits', (_req: Request, res: Response) => {
  try {
    res.json({
      cache: rateLimitService.getAll(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/providers/health - Get provider health status
 */
router.get('/api/providers/health', (_req: Request, res: Response) => {
  try {
    const db = databaseService.loadDb();
    const allProviders = db.metadata.supported_providers;

    const providerHealth = healthService.getAllProvidersStatus(allProviders, db);

    // Generate summary
    const summary = {
      total_providers: providerHealth.length,
      healthy: providerHealth.filter((p) => p.status === 'healthy').length,
      degraded: providerHealth.filter((p) => p.status === 'degraded').length,
      down: providerHealth.filter((p) => p.status === 'down').length,
      unknown: providerHealth.filter((p) => p.status === 'unknown').length,
    };

    res.json({
      providers: providerHealth,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
