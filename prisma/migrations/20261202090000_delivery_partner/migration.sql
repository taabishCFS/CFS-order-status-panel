-- AlterTable
ALTER TABLE "DeliveryBooking" ADD COLUMN     "partner" TEXT NOT NULL DEFAULT 'CFS';

-- AlterTable
ALTER TABLE "DeliveryHistory" ADD COLUMN     "partner" TEXT NOT NULL DEFAULT 'CFS';

