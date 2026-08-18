const IMG_LY_MODULE = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

self.onmessage = async (event) => {
  const { id, buffer, contentType } = event.data || {};
  if (!id || !buffer) return;

  try {
    const module = await import(/* @vite-ignore */ IMG_LY_MODULE);
    const removeBackground = module.removeBackground || module.default;
    if (typeof removeBackground !== 'function') {
      throw new Error('Background-removal module did not expose a remover function');
    }

    const input = new Blob([buffer], { type: contentType || 'application/octet-stream' });
    const result = await removeBackground(input, {
      progress: (_key, current, total) => {
        if (total) self.postMessage({ type: 'progress', id, progress: current / total });
      },
    });

    const output = await result.arrayBuffer();
    self.postMessage({ type: 'done', id, buffer: output, contentType: result.type || 'image/png' }, [output]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
};
