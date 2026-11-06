-- AlterTable
ALTER TABLE `competitions` ADD COLUMN `location` VARCHAR(240) NULL,
    ADD COLUMN `modality` ENUM('ONSITE', 'ONLINE', 'HYBRID') NOT NULL DEFAULT 'ONSITE',
    ADD COLUMN `organizing_unit` VARCHAR(180) NULL;
