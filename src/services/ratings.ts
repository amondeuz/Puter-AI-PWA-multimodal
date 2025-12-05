import * as fs from 'fs';
import * as path from 'path';
import { RatingsOverridesMap, RatingsOverride } from '../types';
import { RATING_FIELDS } from '../utils/constants';

/**
 * Service for managing model ratings overrides
 */
class RatingsService {
  private ratingsFilePath: string;
  private overrides: RatingsOverridesMap = {};

  constructor() {
    // Navigate from src/services to project root
    this.ratingsFilePath = path.join(__dirname, '..', '..', 'ratings-overrides.json');
    this.loadOverrides();
  }

  /**
   * Load ratings overrides from disk
   */
  loadOverrides(): RatingsOverridesMap {
    try {
      if (fs.existsSync(this.ratingsFilePath)) {
        const raw = fs.readFileSync(this.ratingsFilePath, 'utf8');
        this.overrides = JSON.parse(raw) as RatingsOverridesMap;
      }
    } catch (e) {
      console.warn('Could not load ratings overrides:', (e as Error).message);
      this.overrides = {};
    }
    return this.overrides;
  }

  /**
   * Save ratings overrides to disk
   */
  saveOverrides(): void {
    fs.writeFileSync(this.ratingsFilePath, JSON.stringify(this.overrides, null, 2));
  }

  /**
   * Get all overrides
   */
  getOverrides(): RatingsOverridesMap {
    return this.overrides;
  }

  /**
   * Get override for a specific model
   */
  getModelOverride(modelId: string): RatingsOverride | undefined {
    return this.overrides[modelId];
  }

  /**
   * Update ratings for a model
   */
  updateModelRating(modelId: string, updates: RatingsOverride): void {
    this.overrides[modelId] = {
      ...this.overrides[modelId],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.saveOverrides();
  }

  /**
   * Validate rating update request
   */
  validateRatingUpdates(body: Record<string, unknown>): { valid: boolean; updates: RatingsOverride; error?: string; field?: string; value?: unknown } {
    const updates: RatingsOverride = {};

    for (const field of RATING_FIELDS) {
      const ratingKey = `${field}_rating`;
      if (body[ratingKey] !== undefined) {
        const value = parseInt(String(body[ratingKey]), 10);
        if (isNaN(value) || value < 0 || value > 5) {
          return {
            valid: false,
            updates: {},
            error: `Invalid rating value for ${ratingKey}. Must be integer 0-5.`,
            field: ratingKey,
            value: body[ratingKey],
          };
        }
        (updates as Record<string, number | string | undefined>)[field] = value;
      }
    }

    if (body.notes !== undefined) {
      updates.notes = String(body.notes);
    }

    if (Object.keys(updates).length === 0) {
      return {
        valid: false,
        updates: {},
        error: 'No valid updates provided',
      };
    }

    return { valid: true, updates };
  }

  /**
   * Get the file path for ratings
   */
  getFilePath(): string {
    return this.ratingsFilePath;
  }
}

// Export singleton instance
export const ratingsService = new RatingsService();

// Export class for testing
export { RatingsService };
