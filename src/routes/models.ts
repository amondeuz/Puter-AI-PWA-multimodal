import { Router, Request, Response } from 'express';
import {
  ModelsQueryParams,
  SuggestModelsRequest,
  PinokioFilterQuery,
  PresetsQueryParams,
  UpdateRatingRequest,
  ModelCapabilities,
} from '../types';
import { databaseService } from '../services/database';
import { ratingsService } from '../services/ratings';
import {
  buildModelList,
  filterModels,
  suggestModels,
  transformModelForPinokio,
  filterModelsPinokio,
  sortModelsPinokio,
} from '../services/models';
import { boostTierToCostTier, RATING_FIELDS } from '../utils/constants';

const router = Router();

/**
 * GET /models - List models with optional filtering
 */
router.get('/models', (req: Request<object, object, object, ModelsQueryParams>, res: Response) => {
  try {
    const db = databaseService.loadDb();
    const models = buildModelList(db);
    const filtered = filterModels(models, {
      provider: req.query.provider,
      cost_tier: req.query.cost_tier,
      capability: req.query.capability as keyof ModelCapabilities,
    });

    res.json({
      models: filtered,
      count: filtered.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /suggest-models - Get model suggestions based on constraints
 */
router.post('/suggest-models', (req: Request<object, object, SuggestModelsRequest>, res: Response) => {
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

    const suggestions = suggestModels(models, {
      provider: req.body.provider,
      cost_tier: req.body.cost_tier || (boostTier ? boostTierToCostTier(boostTier) ?? undefined : undefined),
      capability: req.body.capability,
      max_cost_tier: req.body.max_cost_tier,
    });

    res.json({
      models: suggestions,
      count: suggestions.length,
      boost_tier: boostTier || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// PINOKIO DASHBOARD API
// ============================================================================

/**
 * GET /api/models - List all models with full metadata (Pinokio format)
 */
router.get('/api/models', (req: Request<object, object, object, PinokioFilterQuery>, res: Response) => {
  try {
    const db = databaseService.loadDb();
    const models = buildModelList(db);

    // Transform to Pinokio format
    let transformed = models.map((m) => transformModelForPinokio(m, db));

    // Apply filters
    transformed = filterModelsPinokio(transformed, req.query);

    // Apply sorting
    transformed = sortModelsPinokio(transformed, req.query.sort_by, req.query.sort_order);

    res.json({
      models: transformed,
      count: transformed.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/models/presets - Pre-sliced views for dashboard
 */
router.get('/api/models/presets', (req: Request<object, object, object, PresetsQueryParams>, res: Response) => {
  try {
    const db = databaseService.loadDb();
    const models = buildModelList(db);
    const transformed = models.map((m) => transformModelForPinokio(m, db));

    // Filter to allowed cost tiers
    const allowedTiers = req.query.cost_tiers
      ? req.query.cost_tiers.split(',')
      : ['remote_free', 'credit_backed'];

    const filtered = transformed.filter((m) => allowedTiers.includes(m.cost_tier));
    const topN = parseInt(req.query.top_n || '10', 10);

    const presets = {
      best_reasoning: sortModelsPinokio(
        filtered.filter((m) => m.supports_reasoning && m.reasoning_rating !== null),
        'reasoning_rating',
        'desc'
      ).slice(0, topN),

      fastest_chat: sortModelsPinokio(
        filtered.filter((m) => m.supports_chat && m.speed_rating !== null),
        'speed_rating',
        'desc'
      ).slice(0, topN),

      best_coding: sortModelsPinokio(
        filtered.filter((m) => m.supports_coding && m.coding_rating !== null),
        'coding_rating',
        'desc'
      ).slice(0, topN),

      best_vision: sortModelsPinokio(
        filtered.filter((m) => m.supports_vision && m.vision_rating !== null),
        'vision_rating',
        'desc'
      ).slice(0, topN),

      all_free_models: filtered.filter((m) => m.cost_tier === 'remote_free'),
    };

    res.json({
      presets,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/models/:model_id - Get single model metadata
 */
router.get('/api/models/:model_id', (req: Request<{ model_id: string }>, res: Response) => {
  try {
    const db = databaseService.loadDb();
    const models = buildModelList(db);
    const model = models.find((m) => m.id === req.params.model_id);

    if (!model) {
      res.status(404).json({
        error: 'Model not found',
        model_id: req.params.model_id,
      });
      return;
    }

    res.json(transformModelForPinokio(model, db));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PATCH /api/models/:model_id/rating - Update model ratings
 */
router.patch('/api/models/:model_id/rating', (req: Request<{ model_id: string }, object, UpdateRatingRequest>, res: Response) => {
  try {
    const db = databaseService.loadDb();
    const models = buildModelList(db);
    const model = models.find((m) => m.id === req.params.model_id);

    if (!model) {
      res.status(404).json({
        error: 'Model not found',
        model_id: req.params.model_id,
      });
      return;
    }

    // Validate rating updates
    const validation = ratingsService.validateRatingUpdates(req.body as Record<string, unknown>);
    if (!validation.valid) {
      res.status(400).json({
        error: validation.error,
        field: validation.field,
        value: validation.value,
        valid_fields: [...RATING_FIELDS.map((f) => `${f}_rating`), 'notes'],
      });
      return;
    }

    // Update ratings
    ratingsService.updateModelRating(req.params.model_id, validation.updates);

    res.json({
      success: true,
      model_id: req.params.model_id,
      updates: validation.updates,
      persisted: true,
      message: 'Rating updated successfully and persisted to disk',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
