/**
 * Compresses an image (File or base64 data-URL) using HTML5 Canvas.
 *
 * - Resizes the image so the longest side ≤ MAX_DIMENSION (1024 px).
 * - Encodes as JPEG, then iteratively lowers quality until the
 *   result is under MAX_BYTES (500 KB).
 *
 * @param fileOrBase64 - A File object or a base64 data-URL string.
 * @param maxDimension - Maximum width or height in pixels (default 1024).
 * @param initialQuality - Starting JPEG quality 0.0–1.0 (default 0.8).
 * @returns A Promise that resolves to a base64 JPEG data-URL.
 */

/** Hard limit: final base64 payload must stay under this size. */
const MAX_BYTES = 500 * 1024; // 500 KB

export async function compressImage(
  fileOrBase64: File | string,
  maxDimension = 1024,
  initialQuality = 0.8
): Promise<string> {
  // 1. Resolve the source to a data-URL string
  const dataUrl: string =
    typeof fileOrBase64 === "string"
      ? fileOrBase64
      : await fileToDataUrl(fileOrBase64);

  // 2. Load the data-URL into an HTMLImageElement
  const img = await loadImage(dataUrl);

  // 3. Calculate output dimensions (scale down only, never up)
  let { width, height } = img;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      // landscape or square
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      // portrait
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  // 4. Draw onto an off-screen canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  ctx.drawImage(img, 0, 0, width, height);

  // 5. Iteratively encode as JPEG, lowering quality until within budget
  let quality = initialQuality;
  let result = canvas.toDataURL("image/jpeg", quality);

  // The base64 portion is roughly 4/3 × raw bytes; check the full data-URL length
  while (result.length > MAX_BYTES && quality > 0.3) {
    quality -= 0.1;
    result = canvas.toDataURL("image/jpeg", quality);
  }

  if (process.env.NODE_ENV === "development") {
    const sizeKB = Math.round(result.length / 1024);
    console.log(
      `[compressor] ${img.naturalWidth}×${img.naturalHeight} → ${width}×${height}  ` +
        `quality=${quality.toFixed(1)}  size=${sizeKB} KB`
    );
  }

  return result;
}

/* ─────────────────── Internal helpers ──────────────────────────────── */

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = src;
  });
}
