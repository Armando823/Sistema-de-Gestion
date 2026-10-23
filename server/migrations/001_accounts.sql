CREATE TABLE IF NOT EXISTS accounts (
  email VARCHAR(254) NOT NULL PRIMARY KEY,
  password_hash VARCHAR(255) NULL,
  role ENUM('admin', 'client') NOT NULL,
  phone VARCHAR(24) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY accounts_phone_idx (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
