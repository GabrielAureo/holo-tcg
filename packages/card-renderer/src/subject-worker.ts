import { removeBackground } from '@imgly/background-removal';
self.onmessage = async (event: MessageEvent) => {
  const { id, buffer, contentType } = event.data || {};
  if (!id || !buffer) return;
  try {
    const input = new Blob([buffer], { type: contentType || 'application/octet-stream' });
    const result = await removeBackground(input, { progress: (_key, current, total) => { if (total) self.postMessage({ type: 'progress', id, progress: current / total }); } });
    const output = await result.arrayBuffer();
    self.postMessage({ type: 'done', id, buffer: output, contentType: result.type || 'image/png' }, [output]);
  } catch (cause) { self.postMessage({ type: 'error', id, message: cause instanceof Error ? cause.message : String(cause) }); }
};
