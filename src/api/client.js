import { reconcileMissedCall, synchronizeMissedCalls, unwrapCallbackResult } from "../utils/callback-status.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BASE_URL;

function getBaseUrl() {
  if (typeof API_BASE_URL !== "string" || !API_BASE_URL.trim()) {
    throw new Error("API base URL is not configured. Set VITE_BASE_URL or VITE_API_BASE_URL to your deployed backend URL.");
  }
  let parsed;
  try {
    parsed = new URL(API_BASE_URL.trim());
  } catch {
    throw new Error("The configured API base URL is invalid. Use a full URL such as https://api.example.com.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("The configured API base URL must use HTTP or HTTPS.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

async function request(path, options = {}) {
  const url = `${getBaseUrl()}${path}`;
  let response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      ...options,
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network request failed.";
    throw new Error(`Could not reach the SecondRing backend (${detail}). Check that it is online and allows this dashboard’s origin in its CORS settings.`);
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let payload = null;
  if (text) {
    if (contentType.includes("application/json") || /^[\[{]/.test(text.trim())) {
      try { payload = JSON.parse(text); } catch {
        throw new Error(`The backend returned invalid JSON for ${path}.`);
      }
    } else if (response.ok) {
      throw new Error(`The backend returned a non-JSON response for ${path}. Check the API URL and endpoint.`);
    } else {
      payload = text;
    }
  }
  if (!response.ok) {
    const detail = typeof payload === "string" ? payload : payload?.detail || payload?.message || payload?.error;
    throw new Error(detail ? `Request failed (${response.status}): ${String(detail)}` : `Request failed with HTTP ${response.status}.`);
  }
  return payload;
}

function listFrom(payload, keys, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of [...keys, "data", "results", "items"]) {
      if (Array.isArray(payload[key])) return payload[key];
      if (payload[key] && typeof payload[key] === "object") {
        for (const nestedKey of keys) if (Array.isArray(payload[key][nestedKey])) return payload[key][nestedKey];
      }
    }
  }
  throw new Error(`Incompatible ${label} response shape. Expected an array or a response envelope containing ${keys.join(" or ")}.`);
}

export async function getMissedCalls() {
  const calls = listFrom(await request("/api/missed_calls"), ["missed_calls", "missedCalls"], "missed calls");
  return synchronizeMissedCalls(calls, getCallbackResult);
}

export async function getBookings() {
  return listFrom(await request("/api/bookings"), ["bookings"], "bookings");
}

export async function getCallbackResult(missedCallId) {
  const record = unwrapCallbackResult(await request(`/api/callback/${encodeURIComponent(missedCallId)}/result`));
  const missedCall = record.missed_call ?? record.missedCall;
  return missedCall ? { ...record, missed_call: reconcileMissedCall(missedCall, record) } : record;
}

export async function triggerCallback(missedCallId) {
  return request(`/api/callback/${encodeURIComponent(missedCallId)}/trigger`, { method: "POST" });
}
