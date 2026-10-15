import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMissedCall, synchronizeMissedCalls, unwrapCallbackResult } from "./callback-status.js";

const call = { id: "test-call", status: "callback_in_progress", bimpe_call_id: "attempt-1" };

test("answered, ended calls override stale in-progress records", () => {
  const result = reconcileMissedCall(call, {
    missed_call: { ...call },
    call_status: "ended",
    answered_at: "2026-01-01T10:00:00Z",
    ended_at: "2026-01-01T10:01:00Z",
  });
  assert.equal(result.status, "callback_completed");
  assert.equal(result.callback_status, "callback_completed");
  assert.equal(call.status, "callback_in_progress");
});

test("unsuccessful attempts do not count as completed conversations", () => {
  for (const status of ["failed", "busy", "no_answer", "cancelled"]) {
    assert.equal(reconcileMissedCall(call, { call_status: status }).status, "failed");
  }
  assert.equal(reconcileMissedCall(call, { call_status: "ended", answered_at: null }).status, "failed");
  assert.equal(reconcileMissedCall(call, {
    call_status: "ended", answered_at: "2026-01-01", error_reason: "provider failure",
  }).status, "failed");
});

test("active attempts remain in progress, even if the list contains an older completion", () => {
  assert.equal(reconcileMissedCall({ ...call, status: "callback_completed" }, {
    call_status: "ringing",
  }).status, "callback_in_progress");
});

test("unknown phases preserve the last known status", () => {
  assert.equal(reconcileMissedCall(call, { call_status: "unrecognized" }).status, call.status);
});

test("nested provider outcomes and response envelopes are handled", () => {
  assert.equal(reconcileMissedCall(call, {
    data: { missed_call: call, callback: { call_status: "completed", bimpe_call_id: "attempt-1" } },
  }).status, "callback_completed");
  assert.throws(() => unwrapCallbackResult(null), /Expected call details/);
  assert.throws(() => unwrapCallbackResult([]), /Expected call details/);
});

test("a different attempt cannot override the current call", () => {
  assert.throws(() => reconcileMissedCall(call, {
    callback: { call_status: "completed", bimpe_call_id: "older-attempt" },
  }), /different call attempt/);
});

test("lists reconcile active records without requesting results for unstarted calls", async () => {
  const requested = [];
  const rows = [call, { id: "pending", status: "pending_callback" }, { id: "done", status: "callback_completed" }];
  const result = await synchronizeMissedCalls(rows, async (id) => {
    requested.push(id);
    return { call_status: "completed" };
  });
  assert.deepEqual(requested, ["test-call"]);
  assert.equal(result[0].status, "callback_completed");
  assert.deepEqual(result.slice(1), rows.slice(1));
});

test("individual sync failures are exposed without hiding other records", async () => {
  const result = await synchronizeMissedCalls([call], async () => { throw new Error("Result unavailable"); });
  assert.equal(result[0].status, "callback_in_progress");
  assert.equal(result[0].synchronization_error, "Result unavailable");
});

test("missing provider IDs are reported without requesting nonexistent results", async () => {
  let requested = false;
  const result = await synchronizeMissedCalls([{ ...call, bimpe_call_id: null }], async () => { requested = true; });
  assert.equal(requested, false);
  assert.match(result[0].synchronization_error, /did not provide a Bimpe call ID/);
});

test("result requests have bounded concurrency", async () => {
  let running = 0;
  let peak = 0;
  const rows = Array.from({ length: 9 }, (_, id) => ({ ...call, id }));
  await synchronizeMissedCalls(rows, async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 2));
    running--;
    return { call_status: "completed" };
  });
  assert.equal(peak, 3);
});
