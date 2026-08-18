-- Seed inicial: roles, usuario admin (placeholder), cliente de ejemplo, item de inventario y orden de ejemplo
-- Nota: reemplaza <SET_PASSWORD_HASH> por un hash válido; no insertar contraseñas en texto plano.

INSERT INTO roles (id, name, permissions, created_at)
VALUES
  (gen_random_uuid(), 'owner', '{"*": true}'::jsonb, now()),
  (gen_random_uuid(), 'admin', '{"orders": "full", "inventory": "full"}'::jsonb, now()),
  (gen_random_uuid(), 'tech', '{"orders": "assigned"}'::jsonb, now()),
  (gen_random_uuid(), 'client_readonly', '{}'::jsonb, now())
ON CONFLICT (name) DO NOTHING;

-- Crear usuario admin (actualizar password hash manualmente)
WITH r AS (SELECT id AS role_id FROM roles WHERE name = 'owner' LIMIT 1)
INSERT INTO users (id, email, password_hash, name, role_id, created_at, updated_at)
SELECT gen_random_uuid(), 'admin@example.com', '<SET_PASSWORD_HASH>', 'Admin', r.role_id, now(), now() FROM r
ON CONFLICT (email) DO NOTHING;

-- Cliente de ejemplo
INSERT INTO clients (id, name, email, phone, created_at)
VALUES (gen_random_uuid(), 'Cliente Demo', 'cliente@example.com', '+56900000000', now())
ON CONFLICT DO NOTHING;

-- Item de inventario de ejemplo
INSERT INTO inventory_items (id, sku, name, description, cost_cents, price_cents, stock, created_at)
VALUES (gen_random_uuid(), 'SKU-0001', 'Pantalla LCD', 'Repuesto pantalla 6.1"', 12000, 25000, 5, now())
ON CONFLICT (sku) DO NOTHING;

-- Orden de ejemplo (dejar order_number NULL para que el trigger la genere)
WITH c AS (SELECT id AS client_id FROM clients LIMIT 1)
INSERT INTO orders (id, order_number, client_id, status, priority, notes, created_at, updated_at)
SELECT gen_random_uuid(), NULL, c.client_id, 'created', 1, 'Orden demo creada por seed', now(), now() FROM c;

-- Asociar device de ejemplo a la última orden creada
WITH o AS (SELECT id FROM orders ORDER BY created_at DESC LIMIT 1)
INSERT INTO devices (id, order_id, label, brand, model, serial, issues_text, created_at)
SELECT gen_random_uuid(), o.id, 'Smartphone cliente', 'DemoBrand', 'Model X', 'SN-DEMO-001', 'Pantalla rota, no enciende', now() FROM o;

-- Nota: revisa y actualiza hashes/credenciales antes de usar en producción.
