import { Router, Request, Response } from 'express';
import {
  PreflightRequest,
  BatchPreflightRequest,
  BatchPreflightTaskResult,
  ModelCapabilities,
} from '../types';
import { databaseService } from '../services/database';
import { buildModelList, suggestModels } from '../services/models';
import { rateLimitService } from '../services/rateLimit';
import { boostTierToCostTier, TASK_CAPABILITY_MAP } from '../utils/constants';
import { checkBoostTierExhaustion } from './account';

const router = Router();

/**
 * POST /preflight - Check if a task can run with current account status
 */
router.post('/preflight', async (req: Request<object, object, PreflightRequest>, res: Response) => {
  try {
    const db = databaseService.loadDb();
    const { boost_tier, task_type, capability } = req.body;

    if (!boost_tier) {
      res.status(400).json({
        error: 'boost_tier is required (must be "turbo" or "ultra")',
      });
      return;
    }

    // Check boost tier exhaustion
    const tierStatus = await checkBoostTierExhaustion(boost_tier, db);

    if (!tierStatus.valid) {
      res.status(400).json({
        error: tierStatus.error,
      });
      return;
    }

    // Get models for this boost tier that match the capability
    const allModels = buildModelList(db);
    let candidateModels = allModels.filter(
      (m) =>
        m.cost_tier === tierStatus.cost_tier &&
        (tierStatus.usable_model_ids || []).includes(m.id)
    );

    // Filter by capability if specified
    if (capability) {
      candidateModels = candidateModels.filter((m) => m.capabilities?.[capability] === true);
    }

    // Filter by task_type if specified
    if (task_type) {
      const requiredCap = TASK_CAPABILITY_MAP[task_type];
      if (requiredCap) {
        candidateModels = candidateModels.filter((m) => m.capabilities?.[requiredCap] === true);
      }
    }

    const canRun = candidateModels.length > 0;

    res.json({
      boost_tier,
      cost_tier: tierStatus.cost_tier,
      boost_tier_exhausted: tierStatus.exhausted,
      can_run: canRun,
      candidate_models: candidateModels.map((m) => ({
        model_id: m.id,
        provider: m.provider,
        capabilities: m.capabilities,
        ratings: m.ratings,
      })),
      suggested_model: candidateModels.length > 0
        ? candidateModels.sort((a, b) => (b.ratings?.speed || 0) - (a.ratings?.speed || 0))[0].id
        : null,
      message: !canRun
        ? tierStatus.message
        : `${candidateModels.length} model(s) available for this task in ${boost_tier} tier.`,
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
 * POST /api/preflight/batch - Check if multiple tasks can run
 */
router.post('/api/preflight/batch', async (req: Request<object, object, BatchPreflightRequest>, res: Response) => {
  try {
    const { boost_tier, tasks } = req.body;

    if (!boost_tier || !['turbo', 'ultra'].includes(boost_tier)) {
      res.status(400).json({
        error: 'boost_tier is required and must be "turbo" or "ultra"',
      });
      return;
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({
        error: 'tasks must be a non-empty array',
      });
      return;
    }

    if (tasks.length > 20) {
      res.status(400).json({
        error: 'Maximum 20 tasks per batch preflight check',
      });
      return;
    }

    const db = databaseService.loadDb();
    const costTier = boostTierToCostTier(boost_tier);
    const allModels = buildModelList(db).filter((m) => m.cost_tier === costTier);

    const results: BatchPreflightTaskResult[] = [];
    let totalTokens = 0;

    // Track simulated consumption per provider during batch check
    const simulatedUsage: Record<string, { requests: number; tokens: number }> = {};

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      totalTokens += task.estimated_tokens || 0;

      // Find candidate models for this task
      let candidates = allModels;

      if (task.model_id) {
        candidates = candidates.filter((m) => m.id === task.model_id);
      }
      if (task.provider) {
        candidates = candidates.filter((m) => m.provider === task.provider);
      }
      if (task.capability) {
        candidates = candidates.filter((m) => m.capabilities?.[task.capability as keyof ModelCapabilities]);
      }

      // Sort by rating for the requested capability
      const sortedCandidates = suggestModels(candidates, {
        capability: (task.capability || 'chat') as keyof ModelCapabilities,
        max_cost_tier: costTier ?? undefined,
      });

      if (sortedCandidates.length === 0) {
        results.push({
          task_index: i,
          can_run: false,
          reason:
            `No ${task.capability || 'chat'} models available in ${boost_tier} tier` +
            (task.provider ? ` from ${task.provider}` : ''),
        });
        continue;
      }

      // Check rate limits for top candidate
      let foundUsable = false;
      for (const candidate of sortedCandidates) {
        const cached = rateLimitService.get(candidate.provider, candidate.id);
        const staticLimits = candidate.limits || {};

        // Get current limits (prefer cached real-time data)
        const requestsRemaining = cached?.requests_remaining ?? staticLimits.rpm ?? 999;
        const tokensRemaining = cached?.tokens_remaining ?? staticLimits.tpm ?? 999999;

        // Account for simulated usage from earlier tasks in this batch
        const providerKey = candidate.provider;
        const simulated = simulatedUsage[providerKey] || { requests: 0, tokens: 0 };

        const effectiveRequestsRemaining = requestsRemaining - simulated.requests;
        const effectiveTokensRemaining = tokensRemaining - simulated.tokens;

        const taskTokens = task.estimated_tokens || 500; // Default estimate

        if (effectiveRequestsRemaining > 0 && effectiveTokensRemaining >= taskTokens) {
          // Can run - update simulated usage
          simulatedUsage[providerKey] = {
            requests: simulated.requests + 1,
            tokens: simulated.tokens + taskTokens,
          };

          results.push({
            task_index: i,
            can_run: true,
            reason: task.model_id ? 'Requested model available' : 'Within rate limits',
            suggested_model: candidate.id,
            suggested_provider: candidate.provider,
          });
          foundUsable = true;
          break;
        }
      }

      if (!foundUsable) {
        // All candidates exhausted - find alternative from different provider
        const exhaustedProviders = sortedCandidates.map((c) => c.provider);
        const alternatives = allModels.filter(
          (m) =>
            !exhaustedProviders.includes(m.provider) &&
            m.capabilities?.[task.capability as keyof ModelCapabilities || 'chat']
        );

        const cached = rateLimitService.get(sortedCandidates[0].provider, sortedCandidates[0].id);
        const resetTime = cached?.reset_time;
        const waitSeconds = resetTime
          ? Math.max(0, Math.ceil((new Date(resetTime).getTime() - Date.now()) / 1000))
          : 60;

        results.push({
          task_index: i,
          can_run: false,
          reason: `Provider ${sortedCandidates[0].provider} rate limited`,
          suggested_model: alternatives[0]?.id,
          suggested_provider: alternatives[0]?.provider,
          estimated_wait_seconds: waitSeconds,
        });
      }
    }

    const tasksRunnable = results.filter((r) => r.can_run).length;
    const tasksBlocked = results.filter((r) => !r.can_run).length;

    // Generate recommendation
    let recommendation = '';
    if (tasksBlocked === 0) {
      recommendation = `All ${tasks.length} tasks can run immediately.`;
    } else if (tasksRunnable === 0) {
      recommendation = `All tasks blocked. Consider switching boost tier or waiting for rate limits to reset.`;
    } else {
      const blockedWithAlt = results.filter((r) => !r.can_run && r.suggested_provider);
      const waits = results.filter((r) => r.estimated_wait_seconds).map((r) => r.estimated_wait_seconds!);
      const minWait = waits.length > 0 ? Math.min(...waits) : undefined;
      recommendation = `${tasksRunnable} of ${tasks.length} tasks can run immediately.`;
      if (blockedWithAlt.length > 0) {
        recommendation += ` ${blockedWithAlt.length} task(s) have alternative providers available.`;
      }
      if (minWait !== undefined && minWait < 120) {
        recommendation += ` Wait ${minWait}s for rate limits to reset.`;
      }
    }

    res.json({
      batch_can_run: tasksBlocked === 0,
      tasks_runnable: tasksRunnable,
      tasks_blocked: tasksBlocked,
      total_estimated_tokens: totalTokens,
      results,
      recommendation,
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
