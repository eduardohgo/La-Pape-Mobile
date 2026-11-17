import { Pool } from 'pg';
import { logFailure } from '../log-operativo.js';

// Construction is lazy: no client, connection or query is opened here.
export function createDatabasePool(databaseConfig, PoolClass = Pool, poolName = 'postgres') {
  if (!databaseConfig) return null;
  const pool = new PoolClass(databaseConfig);
  pool.on?.('error', () => logFailure(poolName + '_idle_connection_error'));
  return pool;
}
