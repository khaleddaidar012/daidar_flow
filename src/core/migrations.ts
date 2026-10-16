export const migration2 = `
DROP TRIGGER lines_no_update;
ALTER TABLE lines ADD COLUMN product_name TEXT NOT NULL DEFAULT '';
ALTER TABLE lines ADD COLUMN product_barcode TEXT NOT NULL DEFAULT '';
ALTER TABLE lines ADD COLUMN base_unit TEXT NOT NULL DEFAULT '';
UPDATE lines SET product_name=(SELECT name FROM products WHERE id=lines.product),product_barcode=(SELECT barcode FROM products WHERE id=lines.product),base_unit=(SELECT base_unit FROM products WHERE id=lines.product);
CREATE TRIGGER lines_no_update BEFORE UPDATE ON lines BEGIN SELECT RAISE(ABORT,'immutable line'); END;
PRAGMA user_version=2;
`;
