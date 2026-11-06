-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(160) NOT NULL,
    `system_role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_token_hash_key`(`token_hash`),
    INDEX `sessions_user_id_expires_at_idx`(`user_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competitions` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `slug` VARCHAR(180) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('DRAFT', 'REGISTRATION', 'READY', 'LIVE', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `starts_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `competitions_slug_key`(`slug`),
    INDEX `competitions_status_starts_at_idx`(`status`, `starts_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competition_members` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role` ENUM('ORGANIZER', 'JUDGE', 'VIEWER') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `competition_members_user_id_role_idx`(`user_id`, `role`),
    UNIQUE INDEX `competition_members_competition_id_user_id_key`(`competition_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competition_rounds` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'READY', 'LIVE', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `anonymous` BOOLEAN NOT NULL DEFAULT false,
    `required_judge_count` INTEGER NOT NULL DEFAULT 1,
    `allow_advance_with_gaps` BOOLEAN NOT NULL DEFAULT false,
    `publish_scores` BOOLEAN NOT NULL DEFAULT false,
    `aggregate_method` VARCHAR(24) NOT NULL DEFAULT 'AVERAGE',
    `tie_break_method` VARCHAR(32) NOT NULL DEFAULT 'TOTAL_SCORE',
    `active_rubric_version_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `competition_rounds_competition_id_status_idx`(`competition_id`, `status`),
    UNIQUE INDEX `competition_rounds_competition_id_sequence_key`(`competition_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contestants` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NOT NULL,
    `display_name` VARCHAR(180) NOT NULL,
    `organization` VARCHAR(180) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(32) NULL,
    `notes` TEXT NULL,
    `status` ENUM('ACTIVE', 'WITHDRAWN', 'DISQUALIFIED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `contestants_competition_id_display_name_idx`(`competition_id`, `display_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competition_entries` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NOT NULL,
    `round_id` CHAR(36) NOT NULL,
    `contestant_id` CHAR(36) NOT NULL,
    `entry_code` VARCHAR(32) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'WITHDRAWN', 'DISQUALIFIED', 'ADVANCED', 'ELIMINATED') NOT NULL DEFAULT 'ACTIVE',
    `title` VARCHAR(180) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `competition_entries_competition_id_round_id_status_idx`(`competition_id`, `round_id`, `status`),
    UNIQUE INDEX `competition_entries_round_id_entry_code_key`(`round_id`, `entry_code`),
    UNIQUE INDEX `competition_entries_round_id_sequence_key`(`round_id`, `sequence`),
    UNIQUE INDEX `competition_entries_round_id_contestant_id_key`(`round_id`, `contestant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `judge_assignments` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NOT NULL,
    `round_id` CHAR(36) NOT NULL,
    `entry_id` CHAR(36) NULL,
    `user_id` CHAR(36) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `judge_assignments_competition_id_round_id_user_id_idx`(`competition_id`, `round_id`, `user_id`),
    INDEX `judge_assignments_entry_id_user_id_idx`(`entry_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubrics` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NOT NULL,
    `round_id` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `rubrics_competition_id_round_id_idx`(`competition_id`, `round_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubric_versions` (
    `id` CHAR(36) NOT NULL,
    `rubric_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rubric_versions_rubric_id_version_key`(`rubric_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubric_criteria` (
    `id` CHAR(36) NOT NULL,
    `rubric_version_id` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `minimum` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `maximum` DECIMAL(8, 2) NOT NULL DEFAULT 10,
    `step` DECIMAL(8, 2) NOT NULL DEFAULT 1,
    `weight` DECIMAL(8, 4) NOT NULL DEFAULT 1,
    `comment_required` BOOLEAN NOT NULL DEFAULT false,
    `sequence` INTEGER NOT NULL,

    UNIQUE INDEX `rubric_criteria_rubric_version_id_sequence_key`(`rubric_version_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competition_sessions` (
    `id` CHAR(36) NOT NULL,
    `round_id` CHAR(36) NOT NULL,
    `current_entry_id` CHAR(36) NULL,
    `state` ENUM('IDLE', 'LIVE', 'PAUSED', 'COMPLETED') NOT NULL DEFAULT 'IDLE',
    `version` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `competition_sessions_round_id_key`(`round_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_sheets` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NOT NULL,
    `round_id` CHAR(36) NOT NULL,
    `entry_id` CHAR(36) NOT NULL,
    `judge_id` CHAR(36) NOT NULL,
    `rubric_version_id` CHAR(36) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'REOPENED') NOT NULL DEFAULT 'DRAFT',
    `total_score` DECIMAL(10, 4) NULL,
    `submitted_at` DATETIME(3) NULL,
    `reopened_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `score_sheets_competition_id_round_id_status_idx`(`competition_id`, `round_id`, `status`),
    UNIQUE INDEX `score_sheets_entry_id_judge_id_key`(`entry_id`, `judge_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_details` (
    `id` CHAR(36) NOT NULL,
    `score_sheet_id` CHAR(36) NOT NULL,
    `criterion_id` CHAR(36) NOT NULL,
    `score` DECIMAL(8, 2) NOT NULL,
    `comment` TEXT NULL,

    UNIQUE INDEX `score_details_score_sheet_id_criterion_id_key`(`score_sheet_id`, `criterion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `result_snapshots` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NOT NULL,
    `round_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `locked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `locked_by` CHAR(36) NOT NULL,
    `data` JSON NOT NULL,

    INDEX `result_snapshots_competition_id_published_locked_at_idx`(`competition_id`, `published`, `locked_at`),
    UNIQUE INDEX `result_snapshots_round_id_version_key`(`round_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_events` (
    `id` CHAR(36) NOT NULL,
    `competition_id` CHAR(36) NULL,
    `actor_id` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(100) NOT NULL,
    `entity_id` VARCHAR(100) NULL,
    `details` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_events_competition_id_created_at_idx`(`competition_id`, `created_at`),
    INDEX `audit_events_actor_id_created_at_idx`(`actor_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_members` ADD CONSTRAINT `competition_members_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_members` ADD CONSTRAINT `competition_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_rounds` ADD CONSTRAINT `competition_rounds_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_rounds` ADD CONSTRAINT `competition_rounds_active_rubric_version_id_fkey` FOREIGN KEY (`active_rubric_version_id`) REFERENCES `rubric_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contestants` ADD CONSTRAINT `contestants_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_entries` ADD CONSTRAINT `competition_entries_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_entries` ADD CONSTRAINT `competition_entries_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_entries` ADD CONSTRAINT `competition_entries_contestant_id_fkey` FOREIGN KEY (`contestant_id`) REFERENCES `contestants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judge_assignments` ADD CONSTRAINT `judge_assignments_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judge_assignments` ADD CONSTRAINT `judge_assignments_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judge_assignments` ADD CONSTRAINT `judge_assignments_entry_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `competition_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judge_assignments` ADD CONSTRAINT `judge_assignments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubrics` ADD CONSTRAINT `rubrics_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubrics` ADD CONSTRAINT `rubrics_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_versions` ADD CONSTRAINT `rubric_versions_rubric_id_fkey` FOREIGN KEY (`rubric_id`) REFERENCES `rubrics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_criteria` ADD CONSTRAINT `rubric_criteria_rubric_version_id_fkey` FOREIGN KEY (`rubric_version_id`) REFERENCES `rubric_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_sessions` ADD CONSTRAINT `competition_sessions_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competition_sessions` ADD CONSTRAINT `competition_sessions_current_entry_id_fkey` FOREIGN KEY (`current_entry_id`) REFERENCES `competition_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_sheets` ADD CONSTRAINT `score_sheets_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_sheets` ADD CONSTRAINT `score_sheets_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_sheets` ADD CONSTRAINT `score_sheets_entry_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `competition_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_sheets` ADD CONSTRAINT `score_sheets_judge_id_fkey` FOREIGN KEY (`judge_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_sheets` ADD CONSTRAINT `score_sheets_rubric_version_id_fkey` FOREIGN KEY (`rubric_version_id`) REFERENCES `rubric_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_details` ADD CONSTRAINT `score_details_score_sheet_id_fkey` FOREIGN KEY (`score_sheet_id`) REFERENCES `score_sheets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_details` ADD CONSTRAINT `score_details_criterion_id_fkey` FOREIGN KEY (`criterion_id`) REFERENCES `rubric_criteria`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `result_snapshots` ADD CONSTRAINT `result_snapshots_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `result_snapshots` ADD CONSTRAINT `result_snapshots_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_competition_id_fkey` FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
