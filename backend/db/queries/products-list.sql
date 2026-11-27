-- Proposed GET /products; not mounted by the current Express application.
-- node-postgres parameters:
-- $1: category UUID or null; $2: after UUID or null; $3: page size or null.
-- The future controller must validate UUIDs and accept page sizes from 1 to 50.
-- SQL also bounds page size. Fetch one additional row to calculate hasMore;
-- return at most the requested page size, using the last returned id as cursor.
-- Price remains decimal text; no conversion through JavaScript floating point.
-- image_url is nullable. Return NULL verbatim for a pending photograph;
-- do not filter out that product or substitute an unverified/mock image URL.
SELECT
    p.id,
    p.sku,
    p.name,
    p.category_id,
    c.name AS category_name,
    p.brand_id,
    b.name AS brand_name,
    p.price::text AS price,
    p.currency,
    p.image_url
FROM catalog.products AS p
JOIN catalog.categories AS c ON c.id = p.category_id
JOIN catalog.brands AS b ON b.id = p.brand_id
WHERE p.is_published = true
  AND p.reviewed_at IS NOT NULL
  AND c.is_active = true
  AND ($1::uuid IS NULL OR p.category_id = $1::uuid)
  AND ($2::uuid IS NULL OR p.id > $2::uuid)
ORDER BY p.id ASC
LIMIT LEAST(GREATEST(COALESCE($3::integer, 20), 1), 50) + 1;
