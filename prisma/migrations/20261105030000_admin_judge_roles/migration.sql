-- Reduce the account roles to Admin and Judge. Only judge assignments remain
-- as competition memberships; Admin permissions are global.
DELETE FROM `competition_members`
WHERE `role` IN ('ORGANIZER', 'VIEWER');

ALTER TABLE `competition_members`
  DROP INDEX `competition_members_user_id_role_idx`,
  DROP COLUMN `role`,
  ADD INDEX `competition_members_user_id_idx` (`user_id`);

ALTER TABLE `users`
  MODIFY `system_role` ENUM('ADMIN', 'USER', 'JUDGE') NOT NULL DEFAULT 'USER';

UPDATE `users`
SET `system_role` = 'JUDGE'
WHERE `system_role` = 'USER';

ALTER TABLE `users`
  MODIFY `system_role` ENUM('ADMIN', 'JUDGE') NOT NULL DEFAULT 'JUDGE';
