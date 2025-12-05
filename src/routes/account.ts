import { Router, Request, Response } from 'express';
import {
  AccountStatusQueryParams,
  BoostTier,
  Database,
  Model,
  BoostTierExhaustionResult,
  ModelUsabilityResult,
} from '../types';
import { databaseService } from '../services/database';
import { buildModelList } from '../services/models';
import { rateLimitService } from '../services/rateLimit';
import { getPuterCredits } from '../providers/puter';
import { boostTierToCostTier } from '../utils/constants';

const router = Router();

/**
 * Check if a model is usable for current Puter account
 */
export async function isModelUsable(model: Model, _db: Database): Promise<ModelUsabilityResult> {
  const costTier = model.cost_tier;

  // If model uses Puter credits, check credit balance
  if (model.uses_puter_credits || costTier === 'credit_backed') {
    const credits = await getPuterCredits();

    if (!credits.available) {
      return {
        usable: false,
        reason: 'Cannot verify Puter credits: ' + credits.error,
        credits_required: true,
        credits_available: null,
      };
    }

    if (credits.balance !== null && credits.balance <= 0) {
      return {
        usable: false,
        reason: 'Puter credits exhausted (balance: 0)',
        credits_required: true,
        credits_available: credits.balance,
      };
    }

    return {
      usable: true,
      reason: 'Puter credits available',
      credits_required: true,
      credits_available: credits.balance,
    };
  }

  // For free-tier models, check if we have rate limit info from recent calls
  const recentLimits = rateLimitService.get(model.provider, model.id);

  if (recentLimits) {
    if (recentLimits.requests_remaining !== null && recentLimits.requests_remaining <= 0) {
      return {
        usable: false,
        reason: `Rate limit exhausted for ${model.provider} - ${recentLimits.requests_remaining} requests remaining`,
        rate_limits: recentLimits,
      };
    }

    if (recentLimits.tokens_remaining !== null && recentLimits.tokens_remaining <= 0) {
      return {
        usable: false,
        reason: `Token quota exhausted for ${model.provider} - ${recentLimits.tokens_remaining} tokens remaining`,
        rate_limits: recentLimits,
      };
    }
  }

  // No recent limit data - assume usable
  return {
    usable: true,
    reason: 'No exhaustion detected (no recent rate limit data)',
    rate_limits: recentLimits,
  };
}

/**
 * Check if a boost tier is exhausted for current account
 */
export async function checkBoostTierExhaustion(boostTier: string, db: Database): Promise<BoostTierExhaustionResult> {
  const costTier = boostTierToCostTier(boostTier);

  if (!costTier) {
    return {
      boost_tier: boostTier,
      valid: false,
      error: `Invalid boost_tier: ${boostTier}. Must be 'turbo' or 'ultra'.`,
    };
  }

  // Get all models for this boost tier
  const allModels = buildModelList(db);
  const tierModels = allModels.filter((m) => m.cost_tier === costTier);

  if (tierModels.length === 0) {
    return {
      boost_tier: boostTier,
      cost_tier: costTier,
      valid: true,
      exhausted: true,
      reason: 'No models available for this boost tier',
      total_models: 0,
      usable_models: 0,
      unusable_models: 0,
    };
  }

  // Check usability of each model
  const usabilityChecks = await Promise.all(
    tierModels.map(async (model) => ({
      model_id: model.id,
      provider: model.provider,
      check: await isModelUsable(model, db),
    }))
  );

  const usableModels = usabilityChecks.filter((c) => c.check.usable);
  const unusableModels = usabilityChecks.filter((c) => !c.check.usable);

  const exhausted = usableModels.length === 0;

  return {
    boost_tier: boostTier,
    cost_tier: costTier,
    valid: true,
    exhausted,
    total_models: tierModels.length,
    usable_models: usableModels.length,
    unusable_models: unusableModels.length,
    usable_model_ids: usableModels.map((c) => c.model_id),
    unusable_model_ids: unusableModels.map((c) => c.model_id),
    unusable_reasons: unusableModels.map((c) => ({
      model_id: c.model_id,
      provider: c.provider,
      reason: c.check.reason,
    })),
    message: exhausted
      ? `All eligible ${boostTier} models are exhausted for this Puter account. Please log out of Puter OS and log into the next account in your rotation if you want to continue using this tier.`
      : `${usableModels.length} of ${tierModels.length} ${boostTier} models are still usable.`,
  };
}

/**
 * GET /account/status - Check account status for a boost tier
 */
router.get('/account/status', async (req: Request<object, object, object, AccountStatusQueryParams>, res: Response) => {
  try {
    const db = databaseService.loadDb();
    const boostTier = (req.query.boost_tier || 'turbo') as BoostTier;

    // Check Puter credits if requested or if checking ultra tier
    let puterCredits = null;
    if (boostTier === 'ultra' || req.query.include_credits === 'true') {
      puterCredits = await getPuterCredits();
    }

    // Check exhaustion for the requested boost tier
    const tierStatus = await checkBoostTierExhaustion(boostTier, db);

    // Also check the other tier for comparison
    const otherTier: BoostTier = boostTier === 'turbo' ? 'ultra' : 'turbo';
    const otherTierStatus = await checkBoostTierExhaustion(otherTier, db);

    // Determine global account exhaustion
    const accountExhausted = (tierStatus.exhausted ?? false) && (otherTierStatus.exhausted ?? false);

    res.json({
      puter_account: puterCredits?.username || 'unknown',
      puter_credits: puterCredits,
      boost_tier_requested: boostTier,
      boost_tier_status: tierStatus,
      other_tier_status: otherTierStatus,
      account_exhausted: accountExhausted,
      recommendation: accountExhausted
        ? 'All boost tiers exhausted. Log out of Puter and log into next account in rotation.'
        : tierStatus.exhausted
          ? `${boostTier} tier exhausted. Consider using ${otherTier} tier, or log out and switch accounts.`
          : `${boostTier} tier is still usable.`,
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
