const normalize = (value) => String(value ?? "").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
const idOf = (call) => call.missed_call_id ?? call.id;

export function unwrapCallbackResult(payload) {
  const record = payload?.data ?? payload?.result ?? payload;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Incompatible callback result response. Expected call details.");
  }
  return record;
}

export function reconcileMissedCall(missedCall, payload) {
  const record = unwrapCallbackResult(payload);
  const callback = record.callback ?? record.callback_result ?? record.bimpe_call ?? record;
  const returnedCall = record.missed_call ?? record.missedCall ?? {};
  const expectedId = missedCall.bimpe_call_id;
  const actualId = callback.bimpe_call_id ?? returnedCall.bimpe_call_id;
  if (expectedId && actualId && expectedId !== actualId) {
    throw new Error("The callback result belongs to a different call attempt. Refresh to try again.");
  }
  const phase = normalize(callback.call_status ?? record.call_status ?? callback.status);
  const reason = callback.error_reason ?? record.error_reason;
  const answeredAt = callback.answered_at ?? record.answered_at;
  const endedAt = callback.ended_at ?? record.ended_at;
  let status = returnedCall.status ?? returnedCall.callback_status ?? missedCall.status ?? missedCall.callback_status;
  const failed = ["failed", "error", "busy", "no_answer", "unanswered", "cancelled", "canceled", "rejected"];
  const completed = ["completed", "callback_completed", "finished"];
  const active = ["ringing", "queued", "initiated", "dialing", "in_progress", "callback_in_progress", "answered", "connected", "ongoing", "started"];
  if (failed.includes(phase) || (reason && (endedAt || phase === "ended"))) {
    status = "failed";
  } else if (completed.includes(phase)) {
    status = "callback_completed";
  } else if (phase === "ended" || endedAt) {
    // An ended attempt that never connected must not count as a completed conversation.
    status = answeredAt ? "callback_completed" : "failed";
  } else if (active.includes(phase)) {
    status = "callback_in_progress";
  }
  return { ...missedCall, ...returnedCall, status, callback_status: status };
}

export async function synchronizeMissedCalls(calls, fetchResult) {
  const results = [...calls];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < calls.length) {
      const index = nextIndex++;
      const call = calls[index];
      const status = normalize(call.status ?? call.callback_status);
      if (status !== "callback_in_progress" && !(status === "pending_callback" && call.bimpe_call_id)) continue;
      const id = idOf(call);
      if (id === undefined || id === null) {
        results[index] = { ...call, synchronization_error: "This record has no missed-call ID." };
        continue;
      }
      if (!call.bimpe_call_id) {
        results[index] = { ...call, synchronization_error: "The backend marked this callback in progress but did not provide a Bimpe call ID." };
        continue;
      }
      try {
        results[index] = reconcileMissedCall(call, await fetchResult(id));
      } catch (error) {
        // Keep the last server state, but explicitly surface that it could not be verified.
        results[index] = { ...call, synchronization_error: error.message || "Could not refresh callback status." };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, calls.length) }, worker));
  return results;
}
