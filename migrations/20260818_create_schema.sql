-- START MIGRATION
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUM TYPES
CREATE TYPE order_status_enum AS ENUM (
  'draft','created','received','diagnosing','awaiting_approval',
  'in_repair','ready_for_pickup','picked_up','returned','canceled'
);

CREATE TYPE payment_status_enum AS ENUM ('pending','succeeded','failed','refunded','canceled');

CREATE TYPE notification_channel_enum AS ENUM ('email','sms','whatsapp');

CREATE TYPE notification_status_enum AS ENUM ('pending','sent','delivered','failed');

-- ROLES & USERS
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  permissions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  password_hash text, -- nullable for quick-access client entries if desired
  name text,
  phone text,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);

-- TECHNICIANS (optional tied to users)
CREATE TABLE technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_code text UNIQUE,
  skills jsonb DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  contact jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CLIENTS
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  phone text,
  meta jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_email ON clients(email);

-- ORDERS / TICKETS
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE, -- e.g. ORD-20260818-0001 (generate in app or via DB function)
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  status order_status_enum NOT NULL DEFAULT 'created',
  priority smallint DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES technicians(id) ON DELETE SET NULL,
  estimated_time_mins integer,
  estimated_cost_cents bigint DEFAULT 0,
  total_cost_cents bigint DEFAULT 0,
  notes text,
  ai_suggestion_id uuid REFERENCES ai_suggestions(id) ON DELETE SET NULL,
  signature_id uuid REFERENCES signatures(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_number ON orders(order_number);

-- DEVICES (equipment tied to an order)
CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  label text, -- e.g., "Celular cliente"
  brand text,
  model text,
  serial text,
  imei text,
  qr_code text UNIQUE, -- printed label value
  issues_text text,
  diagnostics_text text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_devices_qr_code ON devices(qr_code);

-- AI SUGGESTIONS
CREATE TABLE ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  prompt_used text,
  diagnosis_suggestions jsonb,
  parts_suggestions jsonb,
  labor_estimates jsonb,
  confidence numeric(5,4),
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- INVENTORY
CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  cost_cents bigint DEFAULT 0,
  price_cents bigint DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_sku ON inventory_items(sku);

CREATE TABLE inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  change_qty integer NOT NULL, -- negative when removing
  reason text,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_adj_item ON inventory_adjustments(inventory_item_id);

-- ORDER PARTS / LINE ITEMS
CREATE TABLE order_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  description text,
  qty integer NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  total_price_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_parts_order ON order_parts(order_id);

-- SIGNATURES
CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  signer_name text,
  signature_base64 text, -- allow storing raw base64 for offline sync (careful with large sizes)
  signature_url text,    -- canonical storage (S3) URL for retrieval
  signed_at timestamptz,
  device_info jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signatures_order ON signatures(order_id);

-- MEDIA (photos, videos)
CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  uploader_id uuid REFERENCES users(id) ON DELETE SET NULL,
  media_type text, -- 'photo','video','audio'
  file_url text,
  thumb_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_order ON media(order_id);

-- RECEIPTS
CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pdf_url text,
  qr_code_value text, -- token or order URL encoded
  issued_at timestamptz NOT NULL DEFAULT now(),
  taxes_cents bigint DEFAULT 0,
  subtotal_cents bigint DEFAULT 0,
  total_cents bigint DEFAULT 0,
  metadata jsonb DEFAULT '{}'
);
CREATE INDEX idx_receipts_order ON receipts(order_id);

-- WARRANTIES + LOGS
CREATE TABLE warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  start_date date,
  end_date date,
  terms text,
  warranty_code text UNIQUE,
  active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_warranties_order ON warranties(order_id);

CREATE TABLE warranty_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id uuid NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'issued','extended','claimed','voided'
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_warranty_logs_warranty ON warranty_logs(warranty_id);

-- PAYMENTS
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  provider text, -- 'stripe','mercadopago', etc.
  provider_payment_id text,
  status payment_status_enum NOT NULL DEFAULT 'pending',
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  paid_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_provider_pid ON payments(provider, provider_payment_id);

-- NOTIFICATIONS LOG
CREATE TABLE notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  channel notification_channel_enum NOT NULL,
  recipient text NOT NULL,
  template text,
  status notification_status_enum DEFAULT 'pending',
  provider_id text,
  sent_at timestamptz,
  error_text text,
  payload jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_order ON notifications_log(order_id);

-- ORDER STATUS HISTORY
CREATE TABLE order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status_enum,
  to_status order_status_enum NOT NULL,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);

-- AUDIT / ACTIVITY LOGS
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  resource_type text,
  resource_id uuid,
  diff jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);

-- ANALYTICS MATERIALIZED (optional example)
CREATE TABLE analytics_daily_aggregates (
  day date PRIMARY KEY,
  total_revenue_cents bigint DEFAULT 0,
  repairs_done integer DEFAULT 0,
  avg_turnaround_mins numeric(10,2) DEFAULT 0,
  metadata jsonb DEFAULT '{}'
);

-- SAMPLE SEQUENCE-FUNCTION: automatic order_number
CREATE SEQUENCE order_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_number() RETURNS text AS $$
BEGIN
  RETURN FORMAT('ORD-%s-%06s', TO_CHAR(now() AT TIME ZONE 'UTC','YYYYMMDD'), nextval('order_number_seq'));
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Trigger to set order_number if not provided
CREATE OR REPLACE FUNCTION orders_set_order_number() RETURNS trigger AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_set_order_number BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION orders_set_order_number();

-- OPTIONAL: foreign-key cleanup/constraints already set above.

-- INDEX SUGGESTIONS (additional)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory_items(stock);

-- END MIGRATION
