const test = require("node:test");
const assert = require("node:assert/strict");
const { requireArray } = require("../dbInput");

test("accepts arrays, including empty arrays for intentional clearing", () => {
  const rows = [];
  assert.equal(requireArray(rows, "Repairs"), rows);
});

test("rejects invalid database replacements instead of treating them as empty", () => {
  for (const value of [undefined, null, {}, ""]) {
    assert.throws(() => requireArray(value, "Repairs"), {
      name: "TypeError",
      message: "Repairs must be an array.",
    });
  }
});
