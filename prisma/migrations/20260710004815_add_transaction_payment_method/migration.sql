-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('pix', 'debit', 'credit', 'cash', 'transfer');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "paymentMethod" "PaymentMethod";
