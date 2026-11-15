-- Add dynamic rubric configuration while preserving every existing numeric rubric and score.
ALTER TABLE `rubric_versions`
  ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN `scoring_config` JSON NULL;

ALTER TABLE `rubric_criteria`
  ADD COLUMN `group_id` CHAR(36) NULL,
  ADD COLUMN `type` VARCHAR(24) NOT NULL DEFAULT 'NUMERIC',
  ADD COLUMN `config` JSON NULL,
  ADD COLUMN `required` BOOLEAN NOT NULL DEFAULT TRUE,
  MODIFY COLUMN `minimum` DECIMAL(12,4) NOT NULL DEFAULT 0,
  MODIFY COLUMN `maximum` DECIMAL(12,4) NOT NULL DEFAULT 10,
  MODIFY COLUMN `step` DECIMAL(12,4) NOT NULL DEFAULT 1,
  MODIFY COLUMN `weight` DECIMAL(12,4) NOT NULL DEFAULT 1;

UPDATE `rubric_criteria`
SET `config` = JSON_OBJECT(
  'minimum', CAST(`minimum` AS DECIMAL(12,4)),
  'maximum', CAST(`maximum` AS DECIMAL(12,4)),
  'step', CAST(`step` AS DECIMAL(12,4))
)
WHERE `config` IS NULL;

CREATE TABLE `rubric_criterion_groups` (
  `id` CHAR(36) NOT NULL,
  `rubric_version_id` CHAR(36) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `sequence` INTEGER NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `rubric_criterion_groups_rubric_version_id_sequence_key` (`rubric_version_id`, `sequence`),
  CONSTRAINT `rubric_criterion_groups_rubric_version_id_fkey`
    FOREIGN KEY (`rubric_version_id`) REFERENCES `rubric_versions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `rubric_criteria`
  ADD INDEX `rubric_criteria_group_id_idx` (`group_id`),
  ADD CONSTRAINT `rubric_criteria_group_id_fkey`
    FOREIGN KEY (`group_id`) REFERENCES `rubric_criterion_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `score_sheets`
  ADD COLUMN `outcome` VARCHAR(16) NULL,
  MODIFY COLUMN `total_score` DECIMAL(12,4) NULL;

ALTER TABLE `score_details`
  ADD COLUMN `value` JSON NULL,
  MODIFY COLUMN `score` DECIMAL(12,4) NULL;
