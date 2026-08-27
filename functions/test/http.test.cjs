const assert = require("node:assert/strict");
const test = require("node:test");

const { FunctionError } = require("../lib/jsm-google-doc-description/errors.js");
const { createHandler } = require("../lib/jsm-google-doc-description/http.js");

const WEBHOOK_TOKEN = "test-token-".padEnd(64, "x");

class FakeResponse {
  constructor() {
    this.headers = {};
    this.statusCode = undefined;
    this.body = undefined;
  }

  set(field, value) {
    this.headers[field.toLowerCase()] = value;
    return this;
  }

  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  }

  json(body) {
    this.body = body;
  }
}

function request({ method = "POST", token = WEBHOOK_TOKEN, contentType = "application/json", body } = {}) {
  const headers = {
    "content-type": contentType,
    "x-ngeip-webhook-token": token,
  };
  return {
    method,
    body,
    get(name) {
      return headers[name.toLowerCase()];
    },
  };
}

function dependencies(overrides = {}) {
  const logs = [];
  let now = 1_000;
  return {
    value: {
      reader: {
        async read() {
          return {
            attemptCount: 1,
            document: {
              revisionId: "revision-1",
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [{ textRun: { content: "文件內容\n" } }],
                    },
                  },
                ],
              },
            },
          };
        },
      },
      getWebhookToken: () => WEBHOOK_TOKEN,
      log: {
        info(message, data) {
          logs.push({ level: "info", message, data });
        },
        error(message, data) {
          logs.push({ level: "error", message, data });
        },
      },
      createRequestId: () => "request-1",
      now: () => {
        now += 5;
        return now;
      },
      ...overrides,
    },
    logs,
  };
}

test("returns the n8n-compatible content for a valid request", async () => {
  const setup = dependencies();
  const response = new FakeResponse();
  const handler = createHandler(setup.value);

  await handler(
    request({
      body: {
        docUrl: "https://docs.google.com/document/d/Abc_123/edit",
        issueKey: "DMIT-1234",
      },
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-request-id"], "request-1");
  assert.deepEqual(response.body, {
    source: "https://docs.google.com/document/d/Abc_123/edit",
    documentId: "Abc_123",
    revisionId: "revision-1",
    content: "文件內容\n",
    contentHash: "sha256:6929ca76c04a919a610f0ac7020cafeb0c29f5571997780c7fc964eef3f7bdcc",
  });
  assert.equal(setup.logs.length, 1);
  assert.equal(setup.logs[0].data.issueKey, "DMIT-1234");
  assert.equal(JSON.stringify(setup.logs[0]).includes("文件內容"), false);
  assert.equal(JSON.stringify(setup.logs[0]).includes("Abc_123"), false);
});

test("rejects an invalid token before reading the request body", async () => {
  let readerCalled = false;
  const setup = dependencies({
    reader: {
      async read() {
        readerCalled = true;
        throw new Error("must not run");
      },
    },
  });
  const response = new FakeResponse();

  await createHandler(setup.value)(
    request({ token: "wrong", body: { secretDocument: "must not be parsed" } }),
    response,
  );

  assert.equal(readerCalled, false);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error.code, "UNAUTHORIZED");
});

test("rejects non-POST and non-JSON requests", async (context) => {
  await context.test("method", async () => {
    const setup = dependencies();
    const response = new FakeResponse();
    await createHandler(setup.value)(request({ method: "GET" }), response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "POST");
  });

  await context.test("content type", async () => {
    const setup = dependencies();
    const response = new FakeResponse();
    await createHandler(setup.value)(request({ contentType: "text/plain" }), response);
    assert.equal(response.statusCode, 415);
    assert.equal(response.body.error.code, "UNSUPPORTED_MEDIA_TYPE");
  });
});

test("preserves mapped Google Docs errors and never returns content", async () => {
  const setup = dependencies({
    reader: {
      async read() {
        throw new FunctionError(
          403,
          "DOC_ACCESS_DENIED",
          "Function 無法讀取指定的 Google Docs 文件。",
        );
      },
    },
  });
  const response = new FakeResponse();

  await createHandler(setup.value)(
    request({
      body: {
        docUrl: "https://docs.google.com/document/d/Abc_123/edit",
        issueKey: "DMIT-1",
      },
    }),
    response,
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    error: {
      code: "DOC_ACCESS_DENIED",
      message: "Function 無法讀取指定的 Google Docs 文件。",
      requestId: "request-1",
    },
  });
  assert.equal(JSON.stringify(response.body).includes("Abc_123"), false);
});
