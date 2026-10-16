import { readCatalogReview, validateCatalogReview } from './catalog-review.js';

try {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/catalog-validate.js [manifest.json]');
  const manifest = await readCatalogReview(process.argv[2]);
  const { approvedProducts: _approvedProducts, ...summary } = validateCatalogReview(manifest);
  console.log(JSON.stringify({ ...summary, mode: 'offline-only', databaseConnection: false }, null, 2));
} catch (error) {
  console.error(`Catalog validation failed: ${error.message}`);
  process.exitCode = 1;
}
