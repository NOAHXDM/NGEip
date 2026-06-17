/**
 * 頭像上傳前的客戶端縮圖／壓縮工具。
 *
 * 以原生 Canvas API 實作（不引入第三方套件，符合憲章「外部套件最少化」）：
 * 將使用者選取的圖片等比例縮到指定最大邊長，輸出為 webp，藉此把單檔控制在
 * 數十 KB 等級，降低 Firebase Storage 的儲存量與下載 egress 成本。
 */

export interface ResizeOptions {
  /** 最長邊的像素上限（等比例縮放）。預設 512。 */
  maxSize?: number;
  /** webp 壓縮品質，0–1。預設 0.8。 */
  quality?: number;
  /** 輸出 MIME 類型。預設 image/webp。 */
  mimeType?: string;
}

export const DEFAULT_RESIZE_OPTIONS: Required<ResizeOptions> = {
  maxSize: 512,
  quality: 0.8,
  mimeType: 'image/webp',
};

/**
 * 將圖片檔縮放／壓縮後回傳新的 Blob。
 *
 * @throws 當檔案非圖片、無法解碼，或瀏覽器無法輸出指定格式時。
 */
export async function resizeImage(
  file: File,
  options: ResizeOptions = {}
): Promise<Blob> {
  const { maxSize, quality, mimeType } = {
    ...DEFAULT_RESIZE_OPTIONS,
    ...options,
  };

  if (!file.type.startsWith('image/')) {
    throw new Error('檔案不是圖片格式');
  }

  const bitmap = await loadBitmap(file);

  try {
    const { width, height } = scaleToFit(
      bitmap.width,
      bitmap.height,
      maxSize
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('無法建立繪圖內容（Canvas 2D context）');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await canvasToBlob(canvas, mimeType, quality);
  } finally {
    // 釋放 ImageBitmap 佔用的記憶體（若瀏覽器支援）
    if ('close' in bitmap && typeof bitmap.close === 'function') {
      bitmap.close();
    }
  }
}

/** 等比例縮放：確保最長邊不超過 maxSize，且不放大原圖。 */
export function scaleToFit(
  srcWidth: number,
  srcHeight: number,
  maxSize: number
): { width: number; height: number } {
  const longest = Math.max(srcWidth, srcHeight);
  const ratio = longest > maxSize ? maxSize / longest : 1;
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}

/** 以 createImageBitmap 解碼檔案；失敗時拋出可理解的錯誤。 */
async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error('無法解碼圖片，請改用 PNG、JPEG 或 WebP 格式');
  }
}

/** Promise 化的 canvas.toBlob。 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('圖片壓縮失敗'));
        }
      },
      mimeType,
      quality
    );
  });
}
