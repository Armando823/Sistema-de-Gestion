// Reglas de qué órdenes puede ver un cliente.
//  - Orden creada por un cliente (con ownerEmail): solo ese cliente.
//  - Orden creada en el taller (sin ownerEmail): quien tenga el código Y el
//    teléfono registrado en la orden. Así no se pueden ver órdenes ajenas
//    adivinando códigos consecutivos como REP-1001, REP-1002...
const MIN_PHONE_DIGITS = 7;

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

// Compara los últimos dígitos (hasta 10) para que "+57 300 123 4567" y
// "3001234567" cuenten como el mismo número.
function samePhone(a, b) {
  const first = digitsOnly(a);
  const second = digitsOnly(b);
  const length = Math.min(first.length, second.length, 10);
  return length >= MIN_PHONE_DIGITS && first.slice(-length) === second.slice(-length);
}

export function canClientView(repair, clientEmail, phone = "") {
  if (!repair) return false;
  if (repair.ownerEmail) return repair.ownerEmail === clientEmail;
  return samePhone(phone, repair.phone);
}

export function repairsOwnedBy(repairs, clientEmail) {
  return repairs.filter((repair) => repair.ownerEmail === clientEmail);
}
