const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHandler,
  TelegramApiError,
} = require("../lib/telegram-mobileconfig/http.js");

const WEBHOOK_SECRET = "webhook-secret";

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

  send(body) {
    this.body = body;
  }
}

function validUpdate(overrides = {}) {
  return {
    update_id: 12345,
    message: {
      message_id: 99,
      chat: { id: 67890, type: "private" },
      caption: "/createclip label:公司 & 入口 url:https://example.com/?a=1&b=2",
      photo: [{ file_id: "photo-small", file_size: 100 }],
      ...overrides,
    },
  };
}

function request({ method = "POST", secret = WEBHOOK_SECRET, body = validUpdate() } = {}) {
  return {
    method,
    body,
    get(name) {
      if (name.toLowerCase() === "x-telegram-bot-api-secret-token") {
        return secret;
      }
      return undefined;
    },
  };
}

function setup(overrides = {}) {
  const calls = [];
  const logs = [];
  const client = {
    async getFile(fileId) {
      calls.push({ operation: "getFile", fileId });
      return { filePath: "photos/file.jpg", fileSize: 3 };
    },
    async downloadFile(filePath) {
      calls.push({ operation: "downloadFile", filePath });
      return Uint8Array.from([1, 2, 3]);
    },
    async sendMessage(chatId, messageId, text) {
      calls.push({ operation: "sendMessage", chatId, messageId, text });
    },
    async sendDocument(chatId, messageId, document, fileName) {
      calls.push({ operation: "sendDocument", chatId, messageId, document, fileName });
    },
    ...overrides.client,
  };
  let now = 1_000;

  return {
    calls,
    logs,
    dependencies: {
      createTelegramClient: () => client,
      getWebhookSecret: () => WEBHOOK_SECRET,
      createRequestId: () => "request-1",
      log: {
        info(message, data) {
          logs.push({ level: "info", message, data });
        },
        error(message, data) {
          logs.push({ level: "error", message, data });
        },
      },
      now: () => {
        now += 5;
        return now;
      },
      ...overrides.dependencies,
    },
  };
}

test("downloads the image, generates a mobileconfig and waits for sendDocument", async () => {
  const state = setup();
  const response = new FakeResponse();

  await createHandler(state.dependencies)(request(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "ok");
  assert.deepEqual(
    state.calls.map((call) => call.operation),
    ["getFile", "downloadFile", "sendDocument"],
  );
  const sent = state.calls[2];
  assert.equal(sent.fileName, "公司 & 入口.mobileconfig");
  assert.match(sent.document, /<data>AQID<\/data>/u);
  assert.match(sent.document, /公司 &amp; 入口/u);
  assert.match(sent.document, /https:\/\/example\.com\/\?a=1&amp;b=2/u);
  assert.equal(state.logs[0].data.updateId, 12345);
  assert.equal(JSON.stringify(state.logs).includes("67890"), false);
  assert.equal(JSON.stringify(state.logs).includes("example.com"), false);
});

test("rejects an invalid secret before creating a Telegram client", async () => {
  let clientCreated = false;
  const state = setup({
    dependencies: {
      createTelegramClient() {
        clientCreated = true;
        throw new Error("must not run");
      },
    },
  });
  const response = new FakeResponse();

  await createHandler(state.dependencies)(request({ secret: "wrong" }), response);

  assert.equal(response.statusCode, 401);
  assert.equal(clientCreated, false);
});

test("rejects non-POST and malformed updates", async (context) => {
  await context.test("method", async () => {
    const state = setup();
    const response = new FakeResponse();
    await createHandler(state.dependencies)(request({ method: "GET" }), response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "POST");
    assert.deepEqual(state.calls, []);
  });

  await context.test("body", async () => {
    const state = setup();
    const response = new FakeResponse();
    await createHandler(state.dependencies)(request({ body: {} }), response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(state.calls, []);
  });
});

test("ignores non-private messages without calling Telegram", async () => {
  const state = setup();
  const response = new FakeResponse();
  const body = validUpdate({ chat: { id: -1001, type: "supergroup" } });

  await createHandler(state.dependencies)(request({ body }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "ignored");
  assert.deepEqual(state.calls, []);
});

test("replies with a fixed hint for an invalid command", async () => {
  const state = setup();
  const response = new FakeResponse();
  const body = validUpdate({ caption: "not a command" });

  await createHandler(state.dependencies)(request({ body }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "invalid command");
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].operation, "sendMessage");
  assert.match(state.calls[0].text, /\/createclip/u);
});

test("replies with a fixed hint when no image is attached", async () => {
  const state = setup();
  const response = new FakeResponse();
  const body = validUpdate({ photo: undefined });

  await createHandler(state.dependencies)(request({ body }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "missing image");
  assert.equal(state.calls[0].operation, "sendMessage");
  assert.match(state.calls[0].text, /圖片/u);
});

test("returns 502 for a Telegram API failure and logs no message content", async () => {
  const state = setup({
    client: {
      async getFile() {
        throw new TelegramApiError("getFile");
      },
    },
  });
  const response = new FakeResponse();

  await createHandler(state.dependencies)(request(), response);

  assert.equal(response.statusCode, 502);
  assert.equal(response.body, "upstream error");
  assert.equal(state.logs[0].data.result, "TELEGRAM_API_ERROR");
  assert.equal(state.logs[0].data.operation, "getFile");
  assert.equal(JSON.stringify(state.logs).includes("公司"), false);
  assert.equal(JSON.stringify(state.logs).includes("67890"), false);
});
