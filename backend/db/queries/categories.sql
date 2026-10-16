-- Proposed GET /categories; not mounted by the current Express application.
-- No parameters. Only approved, active categories with a published product.
SELECT
    c.id,
    c.name,
    c.description
FROM catalog.categories AS c
WHERE c.is_active = true
  AND EXISTS (
      SELECT 1
      FROM catalog.products AS p
      WHERE p.category_id = c.id
        AND p.is_published = true
        AND p.reviewed_at IS NOT NULL
  )
ORDER BY c.name COLLATE "C" ASC, c.id ASC;
