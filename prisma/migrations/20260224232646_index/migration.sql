-- DropIndex
DROP INDEX "Topic_moduleId_position_idx";

-- CreateIndex
CREATE INDEX "Topic_bunnyVideoId_moduleId_position_idx" ON "Topic"("bunnyVideoId", "moduleId", "position");
