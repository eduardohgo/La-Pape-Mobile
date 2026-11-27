-- Read-only detail of ONE verified demonstration identity from the ZIP.
-- Not commercial merchandise, no brand or inventory fields exposed.
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
WHERE id = $1::uuid
  AND is_demo = true
  AND is_for_sale = false
LIMIT 1;
