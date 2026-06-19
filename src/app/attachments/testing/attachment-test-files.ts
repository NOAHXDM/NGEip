const signatures: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
};

const extensions: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

export function attachmentTestFile(
  contentType: keyof typeof signatures,
  size = signatures[contentType].length,
  name = `fixture.${extensions[contentType]}`
): File {
  const bytes = new Uint8Array(Math.max(size, signatures[contentType].length));
  bytes.set(signatures[contentType]);
  return new File([bytes], name, { type: contentType });
}
