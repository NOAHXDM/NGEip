const assert = require("node:assert/strict");
const test = require("node:test");

const {
  extractN8nCompatiblePlainText,
} = require("../lib/jsm-google-doc-description/plain-text.js");

test("extracts only top-level paragraph text runs without normalizing whitespace", () => {
  const document = {
    body: {
      content: [
        { sectionBreak: {} },
        {
          paragraph: {
            elements: [
              { textRun: { content: "第一" } },
              { textRun: { content: "段\n" } },
              { inlineObjectElement: { inlineObjectId: "image" } },
            ],
          },
        },
        {
          paragraph: {
            bullet: { listId: "list" },
            elements: [{ textRun: { content: "清單內容\n" } }],
          },
        },
        {
          table: {
            tableRows: [
              {
                tableCells: [
                  {
                    content: [
                      {
                        paragraph: {
                          elements: [{ textRun: { content: "不可出現的表格內容\n" } }],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        {
          paragraph: {
            elements: [
              { textRun: { content: "  保留前後空白  \n" } },
              {},
            ],
          },
        },
      ],
    },
  };

  assert.equal(
    extractN8nCompatiblePlainText(document),
    "第一段\n清單內容\n  保留前後空白  \n",
  );
});

test("returns an empty string for an empty or missing body", () => {
  assert.equal(extractN8nCompatiblePlainText({ body: { content: [] } }), "");
  assert.equal(extractN8nCompatiblePlainText({}), "");
});
