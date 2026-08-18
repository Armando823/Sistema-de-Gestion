# Ejemplos de payloads para endpoints clave

## Autenticación
POST /api/v1/auth/login
{
  "email": "admin@example.com",
  "password": "(user password)"
}

Respuesta (ejemplo):
{
  "accessToken": "ey...",
  "refreshToken": "rt...",
  "user": { "id": "...", "email": "admin@example.com", "role": "owner" }
}

## Crear orden (Cliente o Admin)
POST /api/v1/orders
{
  "client": { "email": "cliente@example.com", "name": "Cliente Demo", "phone": "+56900000000" },
  "device": { "brand": "DemoBrand", "model": "Model X", "serial": "SN-DEMO-001", "imei": "" },
  "issue_text": "No enciende y pantalla rota",
  "created_by": "<user-id>"
}

## Firma (base64)
POST /api/v1/orders/:id/signature
Content-Type: application/json
{
  "signer_name": "Juan Perez",
  "signature_base64": "data:image/png;base64,iVBORw0KG...",
  "device_info": { "device": "Android 12", "ip": "" }
}

## Subir media (multipart/form-data)
POST /api/v1/orders/:id/media
- field: file (image/jpeg)
- field: uploader_id

## Añadir repuestos a orden
POST /api/v1/orders/:id/parts
{
  "inventory_item_id": "<sku-uuid>",
  "qty": 1,
  "unit_price_cents": 25000
}

## Crear intento de pago (Stripe)
POST /api/v1/payments/create-intent
{
  "order_id": "<order-id>",
  "method": "stripe",
  "amount_cents": 30000,
  "currency": "CLP"
}

Respuesta (ejemplo): { "clientSecret": "pi_..._secret_..." }

## Webhook de pago (Stripe)
POST /api/v1/payments/webhook/stripe
- Body: raw event JSON de Stripe

## Llamada internal IA (invocada por backend)
POST /api/v1/ai/suggest
{
  "order_id": "<order-id>",
  "issue_text": "No enciende y pantalla rota",
  "device": { "brand": "DemoBrand", "model": "Model X" }
}

Respuesta:
{
  "diagnosis": ["Falla en placa base","Pantalla fisurada"],
  "parts": [{"sku":"SKU-0001","name":"Pantalla LCD","qty":1}],
  "time_estimate_mins": 120,
  "confidence": 0.82
}

## Enviar notificación (internal)
POST /api/v1/notifications/send
{
  "order_id": "<order-id>",
  "channel": "whatsapp",
  "recipient": "+56900000000",
  "template": "order_ready",
  "template_data": { "order_number": "ORD-...", "place": "Taller Central" }
}

