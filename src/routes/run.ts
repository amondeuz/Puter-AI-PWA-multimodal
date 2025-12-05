import { Router, Request, Response } from 'express';
import { RunRequest, CostTier } from '../types';
import { databaseService } from '../services/database';
import { buildModelList, suggestModels, pickModel } from '../services/models';
import { callProvider, extractContent } from '../providers';
import { boostTierToCostTier } from '../utils/constants';
import { isRateLimitError } from '../utils/errors';
import { checkBoostTierExhaustion } from './account';

const router = Router();

/**
 * POST /run - Execute a model inference
 */
router.post('/run', async (req: Request<object, object, RunRequest>, res: Response) => {
  const startTime = Date.now();

  try {
    const db = databaseService.loadDb();
    let models = buildModelList(db);

    // Filter by boost_tier if specified
    const boostTier = req.body.boost_tier;
    if (boostTier) {
      const costTier = boostTierToCostTier(boostTier);
      if (!costTier) {
        res.status(400).json({
          error: `Invalid boost_tier: ${boostTier}. Must be 'turbo' or 'ultra'.`,
        });
        return;
      }
      models = models.filter((m) => m.cost_tier === costTier);
    }

    const selected = pickModel(models, {
      model_id: req.body.model_id,
      capability: req.body.capability,
      max_cost_tier: req.body.max_cost_tier,
    });

    if (!selected) {
      res.status(400).json({
        error: 'No model matched request',
        request: req.body,
        boost_tier: boostTier,
        available_models_count: models.length,
      });
      return;
    }

    // Make actual provider call
    const providerResponse = await callProvider(selected, req.body);

    // Check boost tier exhaustion after call
    let exhaustionCheck = null;
    if (boostTier) {
      exhaustionCheck = await checkBoostTierExhaustion(boostTier, db);
    }

    // Extract content from response
    const output = extractContent(providerResponse);

    res.json({
      model_id: selected.id,
      provider: selected.provider,
      route: selected.route,
      output,
      raw_provider_response: providerResponse,
      error: null,
      metadata: {
        cost_tier: selected.cost_tier,
        boost_tier: boostTier || null,
        execution_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        usage: (providerResponse as Record<string, unknown>).usage || null,
        rate_limits: selected.limits || null,
      },
      boost_tier_exhausted: exhaustionCheck?.exhausted || false,
      boost_tier_message: exhaustionCheck?.message || null,
    });
  } catch (error) {
    const err = error as Error;
    const isRateLimit = isRateLimitError(err);

    // Try to find the selected model for error context
    const db = databaseService.loadDb();
    let models = buildModelList(db);
    const boostTier = req.body.boost_tier;
    if (boostTier) {
      const costTier = boostTierToCostTier(boostTier);
      if (costTier) {
        models = models.filter((m) => m.cost_tier === costTier);
      }
    }
    const selected = req.body.model_id
      ? models.find((m) => m.id === req.body.model_id)
      : null;

    let suggestion = null;

    if (isRateLimit && selected) {
      // Find alternative model with same capability
      const capability = req.body.capability || 'chat';
      const alternatives = suggestModels(models, {
        capability: capability,
        max_cost_tier: (req.body.max_cost_tier || 'remote_free') as CostTier,
      }).filter((m) => m.id !== selected.id && m.provider !== selected.provider);

      if (alternatives.length > 0) {
        suggestion = {
          next_best_model: alternatives[0].id,
          next_best_provider: alternatives[0].provider,
          reason: 'Same capability, different provider',
        };
      }
    }

    res.status(isRateLimit ? 429 : 500).json({
      error: err.message,
      error_type: isRateLimit ? 'rate_limit_exceeded' : 'provider_error',
      provider: selected?.provider,
      model_id: selected?.id,
      retry_after_seconds: isRateLimit ? 60 : null,
      suggestion,
      metadata: {
        execution_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
