import test from "node:test";
import assert from "node:assert/strict";
import { customerPhone } from "./customer-phone.js";

test("uses the API's masked booking phone instead of any raw phone alias", () => {
  assert.equal(customerPhone({
    customer_phone_masked: "+234******0123",
    customer_phone: "+2348000009999",
    phone_number: "+2348000008888",
  }), "+234******0123");
});

test("supports masked-only missed calls and bookings", () => {
  assert.equal(customerPhone({ customer_phone_masked: "*******0123" }), "*******0123");
});

test("masks legacy phone fields without revealing more than the last four digits", () => {
  for (const key of ["customer_phone", "phone_number", "phone", "caller_phone", "from_number"]) {
    assert.equal(customerPhone({ [key]: "+234 (800) 000-0123" }), "•••• 0123");
  }
});

test("empty masked values still safely mask a legacy phone", () => {
  for (const value of [null, undefined, "", "  "]) {
    assert.equal(customerPhone({
      customer_phone_masked: value, customer_phone: "+2348000000123",
    }), "•••• 0123");
  }
});

test("does not display missing, malformed, short, or encrypted phone values", () => {
  for (const value of [null, undefined, "", "1234", "not-a-phone", "gAAAAAB_encrypted_payload", "1234567890123456"]) {
    assert.equal(customerPhone({ customer_phone: value }), null);
  }
  assert.equal(customerPhone(null), null);
  assert.equal(customerPhone({}), null);
});
