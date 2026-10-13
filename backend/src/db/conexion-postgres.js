import { Pool } from 'pg';

// Construction is lazy: no client, connection or query is opened here.
export function createDatabasePool(databaseConfig, PoolClass = Pool) {
  if (!databaseConfig) return null;
  return new PoolClass(databaseConfig);
}
