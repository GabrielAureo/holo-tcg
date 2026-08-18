function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function morphology(alpha, width, height, radius) {
  if (!radius) return alpha;
  const r = Math.abs(radius);
  const dilate = radius > 0;
  let source = alpha;
  for (let pass = 0; pass < r; pass += 1) {
    const next = new Uint8ClampedArray(source.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let value = dilate ? 0 : 255;
        for (let oy = -1; oy <= 1; oy += 1) {
          const yy = clamp(y + oy, 0, height - 1);
          for (let ox = -1; ox <= 1; ox += 1) {
            const xx = clamp(x + ox, 0, width - 1);
            const sample = source[yy * width + xx];
            value = dilate ? Math.max(value, sample) : Math.min(value, sample);
          }
        }
        next[y * width + x] = value;
      }
    }
    source = next;
  }
  return source;
}

function refineAlpha(alpha, width, height, settings) {
  const threshold = clamp(Number(settings.threshold ?? 128), 0, 255);
  const feather = clamp(Number(settings.feather ?? 24), 0, 127);
  const expand = clamp(Math.round(Number(settings.expand ?? 0)), -8, 8);
  const morphed = morphology(alpha, width, height, expand);
  const low = threshold - feather;
  const high = threshold + feather;
  const output = new Uint8ClampedArray(morphed.length);

  for (let i = 0; i < morphed.length; i += 1) {
    const value = morphed[i];
    if (feather === 0) {
      output[i] = value >= threshold ? 255 : 0;
      continue;
    }
    const t = clamp((value - low) / Math.max(1, high - low), 0, 1);
    const smooth = t * t * (3 - 2 * t);
    output[i] = Math.round(smooth * 255);
  }
  return output;
}

self.onmessage = async (event) => {
  const { id, buffer, contentType, settings } = event.data || {};
  if (!id || !buffer) return;
  try {
    const bitmap = await createImageBitmap(new Blob([buffer], { type: contentType || 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) alpha[p] = image.data[i + 3];
    const refined = refineAlpha(alpha, canvas.width, canvas.height, settings || {});
    for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) image.data[i + 3] = refined[p];
    context.putImageData(image, 0, 0);

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const output = await blob.arrayBuffer();
    self.postMessage({ type: 'done', id, buffer: output, contentType: 'image/png' }, [output]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
};
