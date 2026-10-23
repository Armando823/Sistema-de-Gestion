CREATE TABLE IF NOT EXISTS repair_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  repair_id VARCHAR(12) NOT NULL,
  previous_status VARCHAR(40) NOT NULL,
  new_status VARCHAR(40) NOT NULL,
  actor_email VARCHAR(254) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY repair_status_history_repair_idx (repair_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  item_id VARCHAR(100) NOT NULL,
  item_name VARCHAR(160) NOT NULL,
  action ENUM('created', 'updated', 'stock_adjusted', 'deleted') NOT NULL,
  quantity_delta BIGINT NOT NULL,
  stock_after BIGINT UNSIGNED NULL,
  actor_email VARCHAR(254) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY inventory_movements_item_idx (item_id, id),
  KEY inventory_movements_actor_idx (actor_email, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
