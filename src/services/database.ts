import * as fs from 'fs';
import * as path from 'path';
import { Database } from '../types';

/**
 * Database service for loading and caching the model database
 */
class DatabaseService {
  private dbPath: string;
  private cachedDb: Database | null = null;
  private lastLoadTime: number = 0;
  private readonly cacheMaxAge: number = 60000; // 1 minute cache

  constructor() {
    // Navigate from src/services to project root
    this.dbPath = path.join(__dirname, '..', '..', 'model-company-database-v3-complete.json');
  }

  /**
   * Load the database from disk
   */
  loadDb(): Database {
    const now = Date.now();

    // Use cache if still valid
    if (this.cachedDb && (now - this.lastLoadTime) < this.cacheMaxAge) {
      return this.cachedDb;
    }

    const raw = fs.readFileSync(this.dbPath, 'utf8');
    this.cachedDb = JSON.parse(raw) as Database;
    this.lastLoadTime = now;

    return this.cachedDb;
  }

  /**
   * Force reload the database (invalidate cache)
   */
  reloadDb(): Database {
    this.cachedDb = null;
    this.lastLoadTime = 0;
    return this.loadDb();
  }

  /**
   * Get the database path
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Check if database file exists
   */
  exists(): boolean {
    return fs.existsSync(this.dbPath);
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();

// Export class for testing
export { DatabaseService };
