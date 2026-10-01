import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "../frontend/src/utils/csv.js";

test("neutraliza fórmulas de Excel", () => {
  for (const evil of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\t=x"]) {
    assert.ok(csvCell(evil).startsWith(`"'`), evil);
  }
});

test("texto normal y comillas se conservan", () => {
  assert.equal(csvCell("Ana Pérez"), '"Ana Pérez"');
  assert.equal(csvCell('Equipo "X"'), '"Equipo ""X"""');
  assert.equal(csvCell(undefined), '""');
});

test("toCsv une filas y columnas", () => {
  assert.equal(toCsv([["a", "=b"], ["c", "d"]]), `"a","'=b"\n"c","d"`);
});
