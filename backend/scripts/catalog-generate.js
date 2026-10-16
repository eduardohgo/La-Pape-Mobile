import { writeFile } from 'node:fs/promises';
import { generateApprovedCatalogSql, readCatalogReview } from './catalog-review.js';

try {
  const [flag, output, manifestPath] = process.argv.slice(2);
  if (flag !== '--output' || !output || process.argv.length > 6 || !output.endsWith('.sql')) {
    throw new Error('Usage: node scripts/catalog-generate.js --output approved.sql [manifest.json]');
  }
  const sql = generateApprovedCatalogSql(await readCatalogReview(manifestPath));
  // Exclusive file creation prevents silently replacing previously reviewed SQL.
  await writeFile(output, sql, { encoding: 'utf8', flag: 'wx' });
  console.log('Approved SQL prepared offline. Review it before requesting authorization to execute it.');
} catch (error) {
  console.error(`SQL generation blocked: ${error.message}`);
  process.exitCode = 1;
}
