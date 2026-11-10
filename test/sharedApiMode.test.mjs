import test from "node:test";
import assert from "node:assert/strict";
import { usesSharedApi } from "../frontend/src/services/dbService.js";

test("el acceso a datos depende del servidor central", () => {
  assert.equal(usesSharedApi(), true);
});
