INSERT INTO app_counters (counter_key, value)
VALUES ('repair_sync', 0)
ON DUPLICATE KEY UPDATE counter_key = VALUES(counter_key);
