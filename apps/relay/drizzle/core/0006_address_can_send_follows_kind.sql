UPDATE `address` SET `can_send` = CASE WHEN `kind` = 'inbox' THEN 0 ELSE 1 END;
