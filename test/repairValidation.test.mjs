import test from "node:test";
import assert from "node:assert/strict";
import { isValidRepair, isValidEmail, validateRepairForm } from "../frontend/src/utils/repairValidation.js";

const form = {
  customer: "Ana Pérez",
  phone: "300 123 4567",
  device: "HP Pavilion 15",
  problem: "No enciende",
  photos: [],
  authorizedBy: "Ana Pérez",
  consent: true,
  contactEmail: "ana@correo.com",
};

test("el correo de contacto se valida en el formulario", () => {
  assert.equal(validateRepairForm(form, { requireEmail: true }), "");
  assert.match(validateRepairForm({ ...form, contactEmail: "" }, { requireEmail: true }), /correo/i);
  assert.equal(validateRepairForm({ ...form, contactEmail: "" }), "", "opcional si no se exige");
  assert.match(validateRepairForm({ ...form, contactEmail: "ana@correo" }), /no es válido/);
  assert.match(validateRepairForm({ ...form, contactEmail: "a@b.co, c@d.co" }), /no es válido/);
});

test("isValidEmail rechaza varios destinatarios y caracteres raros", () => {
  assert.equal(isValidEmail("ana@correo.com"), true);
  assert.equal(isValidEmail("ana@correo.com;otro@x.com"), false);
  assert.equal(isValidEmail("<ana@correo.com>"), false);
  assert.equal(isValidEmail("ana correo@x.com"), false);
});

test("las órdenes con o sin correo de contacto siguen siendo válidas", () => {
  const repair = {
    id: "REP-1001", customer: "Ana", phone: "3001234567", device: "HP", problem: "x",
    status: "Recibido", updated: "hoy",
  };
  assert.equal(isValidRepair(repair), true, "órdenes antiguas sin correo");
  assert.equal(isValidRepair({ ...repair, contactEmail: "ana@correo.com" }), true);
  assert.equal(isValidRepair({ ...repair, contactEmail: "" }), true);
  assert.equal(isValidRepair({ ...repair, contactEmail: "malo" }), false);
});
