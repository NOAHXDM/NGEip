const assert = require("node:assert/strict");
const test = require("node:test");

const {
  escapeXml,
  generateMobileconfig,
  mobileconfigFileName,
  parseCreateClipCommand,
  selectTelegramImage,
} = require("../lib/telegram-mobileconfig/mobileconfig.js");

test("parses the n8n-compatible createclip command", () => {
  assert.deepEqual(
    parseCreateClipCommand(
      "/createclip label:公司入口 url:https://example.com/path?first=1&second=2",
    ),
    {
      label: "公司入口",
      url: "https://example.com/path?first=1&second=2",
    },
  );
});

for (const input of [
  undefined,
  "hello",
  "/createclip label:公司入口",
  "/createclip label: url:https://example.com",
  "/createclip label:公司入口 url:ftp://example.com",
  "/createclip label:公司入口 url:not-a-url",
]) {
  test(`rejects invalid command: ${String(input)}`, () => {
    assert.equal(parseCreateClipCommand(input), undefined);
  });
}

test("selects the largest Telegram photo", () => {
  assert.deepEqual(
    selectTelegramImage({
      photo: [
        { file_id: "small", file_size: 100, width: 90, height: 90 },
        { file_id: "large", file_size: 500, width: 800, height: 800 },
      ],
    }),
    { fileId: "large", fileSize: 500 },
  );
});

test("accepts an image sent as a Telegram document", () => {
  assert.deepEqual(
    selectTelegramImage({
      document: {
        file_id: "document-image",
        file_size: 1024,
        mime_type: "image/png",
      },
    }),
    { fileId: "document-image", fileSize: 1024 },
  );
  assert.equal(
    selectTelegramImage({
      document: { file_id: "not-image", mime_type: "application/pdf" },
    }),
    undefined,
  );
});

test("escapes XML and generates deterministic plist content", () => {
  const uuids = ["uuid-webclip", "uuid-identifier", "uuid-profile"];
  const mobileconfig = generateMobileconfig(
    { label: "A&B <入口> \"'", url: "https://example.com/?a=1&b=2" },
    Uint8Array.from([1, 2, 3]),
    () => uuids.shift(),
  );

  assert.equal(escapeXml("<&>\"'\u0000"), "&lt;&amp;&gt;&quot;&apos;");
  assert.match(mobileconfig, /<data>AQID<\/data>/u);
  assert.match(mobileconfig, /A&amp;B &lt;入口&gt; &quot;&apos;/u);
  assert.match(mobileconfig, /https:\/\/example\.com\/\?a=1&amp;b=2/u);
  assert.match(mobileconfig, /com\.apple\.webClip\.managed\.uuid-webclip/u);
  assert.match(mobileconfig, /DM\.uuid-identifier/u);
  assert.match(mobileconfig, /<key>PayloadUUID<\/key><string>uuid-profile<\/string>/u);
});

test("sanitizes the generated mobileconfig file name", () => {
  assert.equal(mobileconfigFileName("  Portal/HR:*?  "), "Portal-HR---.mobileconfig");
  assert.equal(mobileconfigFileName("///"), "---.mobileconfig");
  assert.equal(mobileconfigFileName("\u0000"), "-.mobileconfig");
});
