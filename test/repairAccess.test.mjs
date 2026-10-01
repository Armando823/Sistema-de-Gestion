import test from "node:test";
import assert from "node:assert/strict";
import { canClientView, repairsOwnedBy } from "../frontend/src/utils/repairAccess.js";

const own = { id: "REP-1001", ownerEmail: "ana@correo.com", phone: "3001234567" };
const counter = { id: "REP-1002", phone: "+57 300 123 4567" };

test("una orden de cliente solo la ve su dueño", () => {
  assert.equal(canClientView(own, "ana@correo.com"), true);
  assert.equal(canClientView(own, "luis@correo.com"), false);
  assert.equal(canClientView(own, "luis@correo.com", "3001234567"), false);
});

test("una orden del taller exige el teléfono registrado", () => {
  assert.equal(canClientView(counter, "luis@correo.com"), false);
  assert.equal(canClientView(counter, "luis@correo.com", "123"), false);
  assert.equal(canClientView(counter, "luis@correo.com", "573001234567"), true);
  assert.equal(canClientView(counter, "luis@correo.com", "300 123 4567"), true);
  assert.equal(canClientView(counter, "luis@correo.com", "300 123 9999"), false);
});

test("no hay acceso sin orden o con teléfono vacío en ambos lados", () => {
  assert.equal(canClientView(undefined, "a@b.co"), false);
  assert.equal(canClientView({ id: "X", phone: "" }, "a@b.co", ""), false);
});

test("repairsOwnedBy devuelve solo las órdenes del cliente", () => {
  assert.deepEqual(repairsOwnedBy([own, counter], "ana@correo.com"), [own]);
  assert.deepEqual(repairsOwnedBy([own, counter], "otro@correo.com"), []);
});
