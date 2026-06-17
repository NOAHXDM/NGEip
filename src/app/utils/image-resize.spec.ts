/**
 * image-resize 單元測試
 *
 * 覆蓋：
 *  1. scaleToFit 純函式：不放大、橫向/縱向/正方形縮放、四捨五入。
 *  2. resizeImage：超過上限時等比例縮放並輸出 webp。
 *  3. resizeImage：小於上限時不放大。
 *  4. resizeImage：非圖片檔應拒絕。
 *
 * 於 ChromeHeadless 執行，可使用真實 Canvas 與 createImageBitmap。
 */

import { resizeImage, scaleToFit } from './image-resize';

/** 以 Canvas 產生指定尺寸的測試圖片 File。 */
async function makeImageFile(
  width: number,
  height: number,
  type = 'image/png'
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), type)
  );
  return new File([blob], 'test', { type });
}

describe('scaleToFit', () => {
  it('小於上限時不放大', () => {
    expect(scaleToFit(100, 40, 512)).toEqual({ width: 100, height: 40 });
  });

  it('橫向圖以最長邊縮放', () => {
    expect(scaleToFit(1024, 512, 512)).toEqual({ width: 512, height: 256 });
  });

  it('縱向圖以最長邊縮放', () => {
    expect(scaleToFit(512, 1024, 512)).toEqual({ width: 256, height: 512 });
  });

  it('正方形圖縮放', () => {
    expect(scaleToFit(1000, 1000, 500)).toEqual({ width: 500, height: 500 });
  });

  it('非整數比例四捨五入', () => {
    expect(scaleToFit(333, 100, 200)).toEqual({ width: 200, height: 60 });
  });
});

describe('resizeImage', () => {
  it('超過上限時等比例縮放並輸出 webp', async () => {
    const file = await makeImageFile(100, 40);
    const out = await resizeImage(file, { maxSize: 20 });

    expect(out.type).toBe('image/webp');
    const bitmap = await createImageBitmap(out);
    expect(bitmap.width).toBe(20);
    expect(bitmap.height).toBe(8);
  });

  it('小於上限時不放大', async () => {
    const file = await makeImageFile(100, 40);
    const out = await resizeImage(file, { maxSize: 512 });

    const bitmap = await createImageBitmap(out);
    expect(bitmap.width).toBe(100);
    expect(bitmap.height).toBe(40);
  });

  it('非圖片檔應拒絕', async () => {
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    await expectAsync(resizeImage(file)).toBeRejectedWithError(/不是圖片/);
  });
});
