import assert from "node:assert";
import { addPoint, digest } from "../buckets.js";
import { step, close } from "../pointrun.js";
import { render } from "../app.js";

const base = {
  budget: 1, bucket_width: 5, window_buckets: 2,
  state: { buckets: [], last_at: 0, ledger: [], applied: [] },
  events: [{ id: 1, kind: "point", at: 3, source: "a", count: 2 }],
  point_error_code: "E_DUP_POINT", backwards_error_code: "E_TIME_BACKWARDS",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("addPoint returns buckets", () => {
  assert.ok(Array.isArray(addPoint([], 0, "z", 1)));
});

check("digest returns rows", () => {
  assert.ok(Array.isArray(digest([])));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
