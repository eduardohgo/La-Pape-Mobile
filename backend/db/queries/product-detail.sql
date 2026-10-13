-- Proposed GET /products/<uuid>; not mounted by the current Express application.
-- $1: product UUID, validated by the future controller.
-- No row means 404. An unpublished product must not be exposed as a preview.
-- Inventory is deliberately absent: the source stock was not approved.
SELECT
    p.id,
    p.sku,
    p.name,
    p.description,
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
WHERE p.id = $1::uuid
  AND p.is_published = true
  AND p.reviewed_at IS NOT NULL
  AND c.is_active = true
LIMIT 1;
