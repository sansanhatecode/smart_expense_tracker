-- Bỏ giá trị enum `in_batch` vì nó không thể xảy ra.
--
-- Với cách tính dedupe hash ở ADR 9.8, mỗi dòng trong cùng một batch nhận `seq`
-- riêng trong nhóm của nó, nên không có hai dòng nào trong cùng batch trùng hash.
-- Và đó là hành vi đúng: hai dòng giống hệt nhau trong một file sao kê là hai
-- giao dịch thật (hai ly cà phê cùng ngày), không phải một dòng bị lặp.
--
-- Giữ lại một giá trị enum không bao giờ được set nghĩa là để lại một nhánh code
-- không bao giờ chạy và một trạng thái UI không bao giờ hiện — cả hai đều gây
-- nhầm cho người đọc sau.

-- AlterEnum
BEGIN;
CREATE TYPE "DuplicateKind_new" AS ENUM ('none', 'in_db');
ALTER TABLE "public"."StagedTransaction" ALTER COLUMN "duplicate" DROP DEFAULT;
ALTER TABLE "StagedTransaction" ALTER COLUMN "duplicate" TYPE "DuplicateKind_new" USING ("duplicate"::text::"DuplicateKind_new");
ALTER TYPE "DuplicateKind" RENAME TO "DuplicateKind_old";
ALTER TYPE "DuplicateKind_new" RENAME TO "DuplicateKind";
DROP TYPE "public"."DuplicateKind_old";
ALTER TABLE "StagedTransaction" ALTER COLUMN "duplicate" SET DEFAULT 'none';
COMMIT;
