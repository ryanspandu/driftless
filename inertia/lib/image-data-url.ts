/**
 * Resize a raster image in-browser and return a data URL suitable for localStorage.
 *
 * JPEG has no alpha channel, so a transparent source flattened to JPEG loses
 * its transparency — the canvas paints transparent pixels onto an opaque
 * backdrop (black, per the canvas spec) before encoding, which is exactly
 * what turned an uploaded transparent-PNG favicon into one with a solid dark
 * square behind it. Only a JPEG *source* is guaranteed to have no alpha to
 * begin with; anything else (PNG/WebP/GIF/SVG) is re-encoded as PNG instead.
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

    const draw = (w: number, h: number): HTMLCanvasElement => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available.");
      ctx.drawImage(bitmap, 0, 0, w, h);
      return canvas;
    };

    if (file.type !== "image/jpeg") {
      // PNG has no quality knob to shrink with — if it's still too big at
      // the target dimensions, shrink the dimensions instead. These are
      // small icons/logos/favicons, not photos, so PNG rarely needs it.
      let w = width;
      let h = height;
      let data = draw(w, h).toDataURL("image/png");
      while (data.length > maxChars && Math.max(w, h) > 16) {
        w = Math.max(1, Math.round(w * 0.8));
        h = Math.max(1, Math.round(h * 0.8));
        data = draw(w, h).toDataURL("image/png");
      }
      return data;
    }

    let quality = 0.85;
    let data = draw(width, height).toDataURL("image/jpeg", quality);
    while (data.length > maxChars && quality > 0.42) {
      quality -= 0.07;
      data = draw(width, height).toDataURL("image/jpeg", quality);
    }
    return data;
  } finally {
    bitmap.close();
  }
}
