-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COLLECTING', 'COLLECTED', 'PAYOUT_PROCESSING', 'COMPLETED', 'FAILED', 'PAYOUT_FAILED', 'ON_HOLD', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "countryCode" TEXT NOT NULL,
    "momoNumber" TEXT NOT NULL,
    "momoOperator" TEXT NOT NULL,
    "receiveHandle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryRate" (
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dialCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "currencyDecimals" INTEGER NOT NULL DEFAULT 0,
    "unitsPerUsd" DECIMAL(20,8) NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "feeFixed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "minAmount" DECIMAL(18,2) NOT NULL,
    "maxAmount" DECIMAL(18,2) NOT NULL,
    "operators" TEXT[],
    "canSend" BOOLEAN NOT NULL DEFAULT true,
    "canReceive" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryRate_pkey" PRIMARY KEY ("countryCode")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "fromCountry" TEXT NOT NULL,
    "toCountry" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "senderOperator" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientOperator" TEXT NOT NULL,
    "recipientName" TEXT,
    "sendAmount" DECIMAL(18,2) NOT NULL,
    "sendCurrency" TEXT NOT NULL,
    "fee" DECIMAL(18,2) NOT NULL,
    "totalDebit" DECIMAL(18,2) NOT NULL,
    "exchangeRate" DECIMAL(20,8) NOT NULL,
    "receiveAmount" DECIMAL(18,2) NOT NULL,
    "receiveCurrency" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "collectProviderRef" TEXT,
    "payoutProviderRef" TEXT,
    "payoutAttempts" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "collectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionEvent" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_momoNumber_key" ON "User"("momoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_receiveHandle_key" ON "User"("receiveHandle");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_collectProviderRef_key" ON "Transaction"("collectProviderRef");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_payoutProviderRef_key" ON "Transaction"("payoutProviderRef");

-- CreateIndex
CREATE INDEX "Transaction_senderId_createdAt_idx" ON "Transaction"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_recipientId_createdAt_idx" ON "Transaction"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_status_updatedAt_idx" ON "Transaction"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_senderId_idempotencyKey_key" ON "Transaction"("senderId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TransactionEvent_transactionId_createdAt_idx" ON "TransactionEvent"("transactionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_reference_idx" ON "WebhookEvent"("reference");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "CountryRate"("countryCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
