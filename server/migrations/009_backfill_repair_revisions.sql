INSERT IGNORE INTO repair_revisions (repair_id, version)
SELECT id, 1 FROM repairs;
