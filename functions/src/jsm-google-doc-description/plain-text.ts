export interface GoogleDocsTextRun {
  content?: string;
}

export interface GoogleDocsParagraphElement {
  textRun?: GoogleDocsTextRun;
}

export interface GoogleDocsStructuralElement {
  paragraph?: {
    elements?: GoogleDocsParagraphElement[];
  };
  table?: unknown;
  tableOfContents?: unknown;
  sectionBreak?: unknown;
}

export interface GoogleDocsDocument {
  documentId?: string;
  revisionId?: string;
  body?: {
    content?: GoogleDocsStructuralElement[];
  };
}

/** Reproduces the n8n Google Docs v2 node's simple-output extraction. */
export function extractN8nCompatiblePlainText(document: GoogleDocsDocument): string {
  const content = document.body?.content;
  if (!Array.isArray(content)) {
    return "";
  }

  const text: string[] = [];
  for (const structuralElement of content) {
    const elements = structuralElement.paragraph?.elements;
    if (!Array.isArray(elements)) {
      continue;
    }

    for (const element of elements) {
      if (typeof element.textRun?.content === "string") {
        text.push(element.textRun.content);
      }
    }
  }

  return text.join("");
}
