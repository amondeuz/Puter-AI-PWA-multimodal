import { Router } from 'express';
import modelsRoutes from './models';
import runRoutes from './run';
import accountRoutes from './account';
import preflightRoutes from './preflight';
import healthRoutes from './health';
import apiRoutes from './api';

/**
 * Create combined router with all routes
 */
export function createRouter(): Router {
  const router = Router();

  // Mount all route modules
  router.use(modelsRoutes);
  router.use(runRoutes);
  router.use(accountRoutes);
  router.use(preflightRoutes);
  router.use(healthRoutes);
  router.use(apiRoutes);

  return router;
}

// Export individual route modules for testing
export { default as modelsRoutes } from './models';
export { default as runRoutes } from './run';
export { default as accountRoutes } from './account';
export { default as preflightRoutes } from './preflight';
export { default as healthRoutes } from './health';
export { default as apiRoutes } from './api';

// Export helper functions
export { checkBoostTierExhaustion, isModelUsable } from './account';
