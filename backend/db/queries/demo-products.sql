-- Development-only, read-only projection for legacy ZIP demonstrations.
-- This is NOT the published commercial catalog.
SELECT
  id,
  source_sku AS sku,
  name,
  category_id,
  category_name,
  price::text AS price,
  currency,
  image_url,
  is_demo,
  is_for_sale
FROM demo.product_previews
WHERE is_demo = true
  AND is_for_sale = false
ORDER BY source_sku COLLATE "C" ASC
LIMIT 20;
