-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('csv', 'xlsx', 'pdf');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'confirmed', 'rolled_back');

-- CreateEnum
CREATE TYPE "DuplicateKind" AS ENUM ('none', 'in_batch', 'in_db');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Tag',
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" BIGINT NOT NULL,
    "type" "TxType" NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "balance" BIGINT,
    "dedupeHash" TEXT NOT NULL,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "fileName" TEXT NOT NULL,
    "bankProfile" TEXT,
    "rowCount" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagedTransaction" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "categoryId" TEXT,
    "amount" BIGINT NOT NULL,
    "type" "TxType" NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "balance" BIGINT,
    "dedupeHash" TEXT NOT NULL,
    "duplicate" "DuplicateKind" NOT NULL DEFAULT 'none',
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "rawLine" TEXT NOT NULL,

    CONSTRAINT "StagedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "limitAmount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedById_key" ON "RefreshToken"("replacedById");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_type_key" ON "Category"("userId", "name", "type");

-- CreateIndex
CREATE INDEX "CategoryRule_userId_idx" ON "CategoryRule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_userId_keyword_key" ON "CategoryRule"("userId", "keyword");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "Transaction_userId_type_date_idx" ON "Transaction"("userId", "type", "date");

-- CreateIndex
CREATE INDEX "Transaction_importBatchId_idx" ON "Transaction"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_dedupeHash_key" ON "Transaction"("userId", "dedupeHash");

-- CreateIndex
CREATE INDEX "ImportBatch_userId_status_idx" ON "ImportBatch"("userId", "status");

-- CreateIndex
CREATE INDEX "ImportBatch_status_createdAt_idx" ON "ImportBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StagedTransaction_batchId_rowIndex_idx" ON "StagedTransaction"("batchId", "rowIndex");

-- CreateIndex
CREATE INDEX "Budget_userId_month_idx" ON "Budget"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_categoryId_month_key" ON "Budget"("userId", "categoryId", "month");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagedTransaction" ADD CONSTRAINT "StagedTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagedTransaction" ADD CONSTRAINT "StagedTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK constraints — viết tay, vì Prisma schema không diễn đạt được.
-- Đây là chỗ chốt các invariant mà toàn bộ code phía trên dựa vào.
-- ─────────────────────────────────────────────────────────────────────────────

-- ADR 9.4: amount LUÔN dương, chiều thu/chi nằm ở `type`. Nếu chỗ nào trong code
-- lỡ ghi số âm thì phải nổ ở đây, không được lặng lẽ vào DB.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "StagedTransaction"
  ADD CONSTRAINT "StagedTransaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_limit_positive" CHECK ("limitAmount" > 0);

-- Trần 10^15đ. Đây là điều bảo đảm ở tầng DB rằng bigintToNumber() không bao giờ
-- ném lỗi: mọi số tiền đọc ra đều nằm dưới Number.MAX_SAFE_INTEGER (~9*10^15).
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amount_max" CHECK ("amount" <= 1000000000000000);
ALTER TABLE "StagedTransaction"
  ADD CONSTRAINT "StagedTransaction_amount_max" CHECK ("amount" <= 1000000000000000);
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_limit_max" CHECK ("limitAmount" <= 1000000000000000);

-- `month` là TEXT nên không có gì chặn 'thang 8' hay '2026-13' ngoài check này.
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_month_format" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Màu danh mục đi thẳng vào chart, nên phải là hex hợp lệ.
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_color_hex" CHECK ("color" ~ '^#[0-9a-fA-F]{6}$');

-- Mô tả rỗng làm dedupe hash mất discriminator quan trọng nhất.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_description_not_blank" CHECK (btrim("description") <> '');
