-- CreateTable
CREATE TABLE "OpdsCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpdsCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpdsCredential_username_key" ON "OpdsCredential"("username");

-- CreateIndex
CREATE INDEX "OpdsCredential_userId_idx" ON "OpdsCredential"("userId");

-- AddForeignKey
ALTER TABLE "OpdsCredential" ADD CONSTRAINT "OpdsCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
