const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseRequest,
  tokenMatches,
} = require("../lib/jsm-google-doc-description/contract.js");

test("parseRequest accepts a Google Docs URL and preserves its source", () => {
  assert.deepEqual(
    parseRequest({
      docUrl: "  https://docs.google.com/document/d/Abc_123-xYz/edit?tab=t.0#heading=h.test  ",
      issueKey: "DMIT-1234",
    }),
    {
      docUrl: "https://docs.google.com/document/d/Abc_123-xYz/edit?tab=t.0#heading=h.test",
      issueKey: "DMIT-1234",
      documentId: "Abc_123-xYz",
    },
  );
});

for (const [name, request] of [
  ["raw document id", { docUrl: "Abc_123", issueKey: "DMIT-1" }],
  ["non-HTTPS URL", { docUrl: "http://docs.google.com/document/d/Abc_123/edit", issueKey: "DMIT-1" }],
  ["wrong hostname", { docUrl: "https://docs.google.com.example/document/d/Abc_123/edit", issueKey: "DMIT-1" }],
  ["custom port", { docUrl: "https://docs.google.com:444/document/d/Abc_123/edit", issueKey: "DMIT-1" }],
  ["missing document id", { docUrl: "https://docs.google.com/document/d/", issueKey: "DMIT-1" }],
  ["invalid issue key", { docUrl: "https://docs.google.com/document/d/Abc_123/edit", issueKey: "dmit-1" }],
  ["missing field", { docUrl: "https://docs.google.com/document/d/Abc_123/edit" }],
  ["extra field", { docUrl: "https://docs.google.com/document/d/Abc_123/edit", issueKey: "DMIT-1", other: true }],
]) {
  test(`parseRequest rejects ${name}`, () => {
    assert.throws(
      () => parseRequest(request),
      (error) => error.code === "INVALID_REQUEST" && error.status === 400,
    );
  });
}

test("tokenMatches only accepts the exact non-empty token", () => {
  const token = "a".repeat(64);
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches("b".repeat(64), token), false);
  assert.equal(tokenMatches("short", token), false);
  assert.equal(tokenMatches(undefined, token), false);
  assert.equal(tokenMatches(token, ""), false);
});
