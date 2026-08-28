ALTER TABLE "Model" ADD COLUMN "adapterKind" TEXT NOT NULL DEFAULT 'openai-images';
ALTER TABLE "Provider" DROP COLUMN "adapterKind";
