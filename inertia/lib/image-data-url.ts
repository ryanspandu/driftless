/**
 * Resize a raster image in-browser and return a JPEG data URL suitable for localStorage.
 */
export async function imageFileToResizedDataUrl(
  file: File,
  options?: { maxDim?: number; maxDataUrlChars?: number },
): Promise<string> {
  const maxDim = options?.maxDim ?? 384;
  const maxChars = options?.maxDataUrlChars ?? 600_000;

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Could not read this image. Try PNG, JPG, or WebP.");
  });

  try {
    let { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.85;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > maxChars && quality > 0.42) {
      quality -= 0.07;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    return data;
  } finally {
    bitmap.close();
  }
}
