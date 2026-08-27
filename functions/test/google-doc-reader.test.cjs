const assert = require("node:assert/strict");
const test = require("node:test");

const {
  mapGoogleApiError,
} = require("../lib/jsm-google-doc-description/google-doc-reader.js");

for (const [status, expectedStatus, expectedCode] of [
  [403, 403, "DOC_ACCESS_DENIED"],
  [404, 404, "DOC_NOT_FOUND"],
  [429, 429, "UPSTREAM_RATE_LIMITED"],
  [500, 502, "DOCS_API_ERROR"],
  [503, 502, "DOCS_API_ERROR"],
]) {
  test(`maps Google API ${status} to ${expectedCode}`, () => {
    const mapped = mapGoogleApiError({ response: { status } });
    assert.equal(mapped.status, expectedStatus);
    assert.equal(mapped.code, expectedCode);
  });
}

for (const error of [
  { name: "AbortError" },
  { code: "ETIMEDOUT" },
  { code: "ECONNABORTED" },
]) {
  test(`maps ${error.name ?? error.code} to DOCS_API_TIMEOUT`, () => {
    const mapped = mapGoogleApiError(error);
    assert.equal(mapped.status, 504);
    assert.equal(mapped.code, "DOCS_API_TIMEOUT");
  });
}

test("maps unknown upstream errors to a fixed safe response", () => {
  const mapped = mapGoogleApiError(new Error("sensitive upstream detail"));
  assert.equal(mapped.status, 502);
  assert.equal(mapped.code, "DOCS_API_ERROR");
  assert.equal(mapped.message.includes("sensitive upstream detail"), false);
});
