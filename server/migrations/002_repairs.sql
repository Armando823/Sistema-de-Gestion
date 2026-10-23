CREATE TABLE IF NOT EXISTS repairs (
  id VARCHAR(12) NOT NULL PRIMARY KEY,
  customer VARCHAR(160) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  device VARCHAR(160) NOT NULL,
  problem TEXT NOT NULL,
  status VARCHAR(40) NOT NULL,
  updated VARCHAR(80) NOT NULL,
  created_at VARCHAR(40) NULL,
  owner_email VARCHAR(254) NULL,
  owner_phone VARCHAR(24) NULL,
  authorized_by VARCHAR(160) NULL,
  signature MEDIUMTEXT NULL,
  photos JSON NOT NULL,
  contact_email VARCHAR(254) NULL,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  KEY repairs_owner_email_idx (owner_email),
  KEY repairs_owner_phone_idx (owner_phone),
  CONSTRAINT repairs_owner_email_fk FOREIGN KEY (owner_email)
    REFERENCES accounts(email) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
