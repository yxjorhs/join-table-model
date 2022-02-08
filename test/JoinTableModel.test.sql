CREATE TABLE IF NOT EXISTS `user` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'id',
  `nickname` VARCHAR(32) NOT NULL COMMENT 'nickname'
) ENGINE=InnoDB CHARSET=utf8mb4 COMMENT='user';

CREATE TABLE IF NOT EXISTS `phone` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'id',
  `user_id` INT UNSIGNED NOT NULL COMMENT 'user_id',
  `phone` VARCHAR(16) NOT NULL COMMENT 'phone'
) ENGINE=InnoDB CHARSET=utf8mb4 COMMENT='phone';

TRUNCATE TABLE `user`;
TRUNCATE TABLE `phone`;

INSERT INTO `user` VALUES (1, "yxjorhs");
INSERT INTO `phone` VALUES (1, 1, "15911111111");