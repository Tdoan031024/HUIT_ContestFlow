-- Allow local username-only Admin accounts while preserving email accounts.
ALTER TABLE `users`
  MODIFY `email` VARCHAR(255) NULL,
  ADD COLUMN `username` VARCHAR(80) NULL,
  ADD UNIQUE INDEX `users_username_key` (`username`);
