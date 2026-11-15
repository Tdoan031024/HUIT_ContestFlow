UPDATE `competitions`
SET `status` = 'READY'
WHERE `status` = 'DRAFT';

ALTER TABLE `competitions`
MODIFY `status` ENUM('REGISTRATION', 'READY', 'LIVE', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'READY';
