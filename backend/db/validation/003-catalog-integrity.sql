-- Future review after a separately approved import. No personal row data returned.
-- Compare counts and product UUIDs with the reviewed generated import artifact.
-- All violation counts must be zero; product_rows must equal approved imports,
-- not the ten pending candidates. The initial empty schema has zero product rows.
-- pending_photo_rows is informational and may be positive; it is not a violation.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT
    COUNT(*) AS product_rows,
    COUNT(*) FILTER (WHERE p.is_published = true) AS published_rows,
    COUNT(*) FILTER (WHERE p.is_published = false) AS unpublished_rows,
    COUNT(*) FILTER (WHERE c.id IS NULL) AS orphan_category_rows,
    COUNT(*) FILTER (WHERE b.id IS NULL) AS orphan_brand_rows,
    COUNT(*) FILTER (
        WHERE p.is_published = true
          AND (p.reviewed_at IS NULL OR c.is_active IS DISTINCT FROM true)
    ) AS invalid_published_rows,
    COUNT(*) FILTER (
        WHERE p.price <= 0 OR p.currency <> 'MXN'
    ) AS invalid_price_or_currency_rows,
    COUNT(*) FILTER (
        WHERE p.image_url IS NULL
    ) AS pending_photo_rows,
    COUNT(*) FILTER (
        WHERE p.image_url IS NOT NULL
          AND (
            length(p.image_url) > 2048
            OR p.image_url !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?(/[^[:space:]@?#\\]*)?$'
          )
    ) AS non_https_image_rows,
    COUNT(*) FILTER (
        WHERE p.sku ~ '^(SYN-|SYNTHETIC|SINTETICO)'
           OR p.name ~* '\[SINT[EÉ]TICO_ECBD\]|SYN-ECBD-|synthetic_batch_id'
           OR p.description ~* '\[SINT[EÉ]TICO_ECBD\]|SYN-ECBD-|synthetic_batch_id'
    ) AS synthetic_marker_rows,
    COUNT(*) FILTER (
        WHERE p.sku !~ '^[A-Z0-9][A-Z0-9._-]{0,59}$'
    ) AS invalid_sku_rows
FROM catalog.products AS p
LEFT JOIN catalog.categories AS c ON c.id = p.category_id
LEFT JOIN catalog.brands AS b ON b.id = p.brand_id;

-- UUID-only comparison with the approved manifest is required before exposing API.
SELECT p.id
FROM catalog.products AS p
ORDER BY p.id ASC;
ROLLBACK;
