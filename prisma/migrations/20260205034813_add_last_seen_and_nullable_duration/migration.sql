-- AlterTable
ALTER TABLE "Contest" ALTER COLUMN "auctionBidDuration" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);
