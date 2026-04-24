ALTER TABLE "FileAsset"
ADD COLUMN "koreaderHash" TEXT;

CREATE INDEX "FileAsset_koreaderHash_idx" ON "FileAsset"("koreaderHash");

CREATE TABLE "KoreaderCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoreaderCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KoreaderCredential_userId_key" ON "KoreaderCredential"("userId");
CREATE UNIQUE INDEX "KoreaderCredential_username_key" ON "KoreaderCredential"("username");

ALTER TABLE "KoreaderCredential"
ADD CONSTRAINT "KoreaderCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
