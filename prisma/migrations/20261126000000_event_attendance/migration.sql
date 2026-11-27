CREATE TABLE `attendance_events` (
  `id` CHAR(36) NOT NULL,
  `public_code` VARCHAR(48) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `description` TEXT NULL,
  `venue` VARCHAR(240) NOT NULL,
  `event_starts_at` DATETIME(3) NOT NULL,
  `event_ends_at` DATETIME(3) NOT NULL,
  `check_in_starts_at` DATETIME(3) NOT NULL,
  `check_in_ends_at` DATETIME(3) NOT NULL,
  `latitude` DECIMAL(10, 7) NULL,
  `longitude` DECIMAL(10, 7) NULL,
  `geofence_radius_meters` INTEGER NOT NULL DEFAULT 150,
  `location_required` BOOLEAN NOT NULL DEFAULT true,
  `photo_required` BOOLEAN NOT NULL DEFAULT true,
  `expected_attendees` INTEGER NOT NULL DEFAULT 0,
  `max_active_checkins` INTEGER NOT NULL DEFAULT 30,
  `max_queue_size` INTEGER NOT NULL DEFAULT 5000,
  `custom_fields` JSON NULL,
  `status` ENUM('DRAFT', 'OPEN', 'CLOSED', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `attendance_events_public_code_key` (`public_code`),
  INDEX `attendance_events_status_check_in_starts_at_check_in_ends_at_idx` (`status`, `check_in_starts_at`, `check_in_ends_at`),
  INDEX `attendance_events_created_by_id_created_at_idx` (`created_by_id`, `created_at`),
  CONSTRAINT `attendance_events_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attendance_queue_tickets` (
  `id` CHAR(36) NOT NULL,
  `event_id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `client_hash` CHAR(64) NOT NULL,
  `status` ENUM('WAITING', 'ACTIVE', 'CHECKED_IN', 'EXPIRED') NOT NULL DEFAULT 'WAITING',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `active_until` DATETIME(3) NULL,
  `checked_in_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `attendance_queue_tickets_token_hash_key` (`token_hash`),
  INDEX `attendance_queue_tickets_event_id_status_created_at_idx` (`event_id`, `status`, `created_at`),
  INDEX `attendance_queue_tickets_event_id_client_hash_status_idx` (`event_id`, `client_hash`, `status`),
  INDEX `attendance_queue_tickets_status_active_until_idx` (`status`, `active_until`),
  CONSTRAINT `attendance_queue_tickets_event_id_fkey`
    FOREIGN KEY (`event_id`) REFERENCES `attendance_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attendance_capacity_slots` (
  `id` CHAR(36) NOT NULL,
  `event_id` CHAR(36) NOT NULL,
  `slot_no` INTEGER NOT NULL,
  `ticket_id` CHAR(36) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `attendance_capacity_slots_ticket_id_key` (`ticket_id`),
  UNIQUE INDEX `attendance_capacity_slots_event_id_slot_no_key` (`event_id`, `slot_no`),
  INDEX `attendance_capacity_slots_event_id_ticket_id_idx` (`event_id`, `ticket_id`),
  CONSTRAINT `attendance_capacity_slots_event_id_fkey`
    FOREIGN KEY (`event_id`) REFERENCES `attendance_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `attendance_capacity_slots_ticket_id_fkey`
    FOREIGN KEY (`ticket_id`) REFERENCES `attendance_queue_tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attendance_records` (
  `id` CHAR(36) NOT NULL,
  `event_id` CHAR(36) NOT NULL,
  `ticket_id` CHAR(36) NOT NULL,
  `idempotency_key` CHAR(64) NOT NULL,
  `identity_hash` CHAR(64) NOT NULL,
  `full_name` VARCHAR(180) NOT NULL,
  `student_id` VARCHAR(80) NULL,
  `email` VARCHAR(255) NULL,
  `organization` VARCHAR(180) NULL,
  `custom_answers` JSON NULL,
  `latitude` DECIMAL(10, 7) NULL,
  `longitude` DECIMAL(10, 7) NULL,
  `location_accuracy_meters` DECIMAL(10, 2) NULL,
  `location_captured_at` DATETIME(3) NULL,
  `photo_key` VARCHAR(255) NULL,
  `manual_override` BOOLEAN NOT NULL DEFAULT false,
  `override_reason` TEXT NULL,
  `checked_in_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `attendance_records_ticket_id_key` (`ticket_id`),
  UNIQUE INDEX `attendance_records_idempotency_key_key` (`idempotency_key`),
  UNIQUE INDEX `attendance_records_event_id_identity_hash_key` (`event_id`, `identity_hash`),
  INDEX `attendance_records_event_id_checked_in_at_idx` (`event_id`, `checked_in_at`),
  INDEX `attendance_records_event_id_full_name_idx` (`event_id`, `full_name`),
  CONSTRAINT `attendance_records_event_id_fkey`
    FOREIGN KEY (`event_id`) REFERENCES `attendance_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `attendance_records_ticket_id_fkey`
    FOREIGN KEY (`ticket_id`) REFERENCES `attendance_queue_tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attendance_rate_limits` (
  `bucket_key` VARCHAR(128) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `reset_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`bucket_key`),
  INDEX `attendance_rate_limits_reset_at_idx` (`reset_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attendance_failures` (
  `id` CHAR(36) NOT NULL,
  `event_id` CHAR(36) NOT NULL,
  `reason_code` VARCHAR(80) NOT NULL,
  `source_hash` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `attendance_failures_event_id_created_at_idx` (`event_id`, `created_at`),
  INDEX `attendance_failures_event_id_reason_code_created_at_idx` (`event_id`, `reason_code`, `created_at`),
  CONSTRAINT `attendance_failures_event_id_fkey`
    FOREIGN KEY (`event_id`) REFERENCES `attendance_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
