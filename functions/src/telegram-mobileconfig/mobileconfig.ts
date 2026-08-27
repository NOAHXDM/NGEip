import { randomUUID } from "node:crypto";

const CREATE_CLIP_COMMAND =
  /^\/createclip\s+label:(.+?)\s+url:(https?:\/\/\S+)\s*$/u;
const INVALID_FILE_NAME_CHARACTERS = /[\u0000-\u001f\u007f/\\:*?"<>|]/gu;
const INVALID_XML_1_0_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu;

export interface CreateClipCommand {
  label: string;
  url: string;
}

export interface TelegramPhotoSize {
  file_id?: unknown;
  file_size?: unknown;
  width?: unknown;
  height?: unknown;
}

export interface TelegramImageMessage {
  photo?: unknown;
  document?: {
    file_id?: unknown;
    file_size?: unknown;
    mime_type?: unknown;
  };
}

export interface TelegramImageFile {
  fileId: string;
  fileSize?: number;
}

export function parseCreateClipCommand(input: unknown): CreateClipCommand | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const match = CREATE_CLIP_COMMAND.exec(input.trim());
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const label = match[1].trim();
  const rawUrl = match[2].trim();
  if (!label) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  return { label, url: rawUrl };
}

export function selectTelegramImage(message: TelegramImageMessage): TelegramImageFile | undefined {
  if (Array.isArray(message.photo)) {
    const candidates = (message.photo as TelegramPhotoSize[])
      .filter((photo): photo is TelegramPhotoSize & { file_id: string } =>
        typeof photo.file_id === "string" && photo.file_id.length > 0)
      .sort((left, right) => {
        const leftSize = typeof left.file_size === "number" ? left.file_size : 0;
        const rightSize = typeof right.file_size === "number" ? right.file_size : 0;
        if (leftSize !== rightSize) {
          return rightSize - leftSize;
        }

        const leftArea = typeof left.width === "number" && typeof left.height === "number"
          ? left.width * left.height
          : 0;
        const rightArea = typeof right.width === "number" && typeof right.height === "number"
          ? right.width * right.height
          : 0;
        return rightArea - leftArea;
      });

    const selected = candidates[0];
    if (selected) {
      return {
        fileId: selected.file_id,
        ...(typeof selected.file_size === "number" ? { fileSize: selected.file_size } : {}),
      };
    }
  }

  const document = message.document;
  if (
    document &&
    typeof document.file_id === "string" &&
    document.file_id.length > 0 &&
    typeof document.mime_type === "string" &&
    document.mime_type.startsWith("image/")
  ) {
    return {
      fileId: document.file_id,
      ...(typeof document.file_size === "number" ? { fileSize: document.file_size } : {}),
    };
  }

  return undefined;
}

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_1_0_CHARACTERS, "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

export function mobileconfigFileName(label: string): string {
  const safeLabel = label
    .replace(INVALID_FILE_NAME_CHARACTERS, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 100);
  return `${safeLabel || "webclip"}.mobileconfig`;
}

export function generateMobileconfig(
  command: CreateClipCommand,
  image: Uint8Array,
  createUuid: () => string = randomUUID,
): string {
  const escapedLabel = escapeXml(command.label);
  const escapedUrl = escapeXml(command.url);
  const imageBase64 = Buffer.from(image).toString("base64");
  const webClipUuid = createUuid();
  const profileIdentifierUuid = createUuid();
  const profileUuid = createUuid();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key><true/>
      <key>Icon</key><data>${imageBase64}</data>
      <key>IgnoreManifestScope</key><false/>
      <key>IsRemovable</key><true/>
      <key>Label</key><string>${escapedLabel}</string>
      <key>PayloadDescription</key><string>配置 Web Clip 設定</string>
      <key>PayloadDisplayName</key><string>Web Clip</string>
      <key>PayloadIdentifier</key><string>com.apple.webClip.managed.${webClipUuid}</string>
      <key>PayloadType</key><string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key><string>${webClipUuid}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>Precomposed</key><false/>
      <key>URL</key><string>${escapedUrl}</string>
    </dict>
  </array>
  <key>PayloadDescription</key><string>${escapedLabel}</string>
  <key>PayloadDisplayName</key><string>${escapedLabel}</string>
  <key>PayloadIdentifier</key><string>DM.${profileIdentifierUuid}</string>
  <key>PayloadOrganization</key><string>${escapedLabel}</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${profileUuid}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>`;
}
