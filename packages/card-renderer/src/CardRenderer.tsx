import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { CardDefinition } from '@holo/card-schema';
import './index.css';

const identityArtworkUrl = (url: string) => url;
const cardBacks = {
  aurora: new URL('../assets/card-backs/aurora.svg', import.meta.url).href,
  cosmic: new URL('../assets/card-backs/cosmic.svg', import.meta.url).href,
  gold: new URL('../assets/card-backs/gold.svg', import.meta.url).href,
  minimal: new URL('../assets/card-backs/minimal.svg', import.meta.url).href,
} as const;

export type CardRendererStatus = 'idle' | 'loading-artwork' | 'separating-subject' | 'refining-mask' | 'ready' | 'error';
export type ArtworkPlacement = Pick<CardDefinition['artwork'], 'x' | 'y'>;
export interface ArtworkMetrics { naturalWidth: number; naturalHeight: number }
export interface CardRendererProps {
  card: CardDefinition;
  resolveArtworkUrl?: (url: string) => string;
  interactive?: boolean;
  className?: string;
  subjectRefreshKey?: number;
  onArtworkPlacementChange?: (placement: ArtworkPlacement) => void;
  onArtworkLoad?: (metrics: ArtworkMetrics) => void;
  onStatusChange?: (status: CardRendererStatus, error?: Error) => void;
}
type RendererStyle = CSSProperties & Record<`--${string}`, string | number>;
type WorkerResult = { buffer: ArrayBuffer; contentType: string };
type DragState = { pointerId: number; startClientX: number; startClientY: number; startX: number; startY: number; active: boolean };

function createAbortError() { return new DOMException('Aborted', 'AbortError'); }

function runWorker(worker: Worker, payload: Record<string, unknown>, transfer: Transferable[] = [], signal?: AbortSignal) {
  return new Promise<WorkerResult>((resolve, reject) => {
    const id = crypto.randomUUID();
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => finish(() => reject(createAbortError()));
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.id !== id || message.type === 'progress') return;
      if (message.type === 'done') finish(() => resolve({ buffer: message.buffer, contentType: message.contentType || 'image/png' }));
      else finish(() => reject(new Error(message.message || 'Card rendering worker failed')));
    });
    worker.addEventListener('error', (event) => finish(() => reject(new Error(event.message || 'Card rendering worker failed'))), { once: true });
    worker.postMessage({ ...payload, id }, transfer);
  });
}

function useSeparatedSubject(artworkUrl: string, separated: boolean, refreshKey: number, report: CardRendererProps['onStatusChange']) {
  const [baseSubject, setBaseSubject] = useState<Blob | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (!separated || !artworkUrl) { setBaseSubject(null); return () => controller.abort(); }
    setBaseSubject(null);
    void (async () => {
      try {
        report?.('loading-artwork');
        const response = await fetch(artworkUrl, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error(`Artwork request returned ${response.status}`);
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const input = await response.arrayBuffer();
        report?.('separating-subject');
        const result = await runWorker(new Worker(new URL('./subject-worker.ts', import.meta.url), { type: 'module' }), { buffer: input, contentType }, [input], controller.signal);
        if (!controller.signal.aborted) setBaseSubject(new Blob([result.buffer], { type: result.contentType }));
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (!controller.signal.aborted) { setBaseSubject(null); report?.('error', error); }
      }
    })();
    return () => controller.abort();
  }, [artworkUrl, separated, refreshKey]);
  return baseSubject;
}

function useRefinedSubject(baseSubject: Blob | null, mask: CardDefinition['artwork']['subject'] extends infer Subject ? Subject extends { mask: infer Mask } ? Mask : never : never, report: CardRendererProps['onStatusChange']) {
  const [subjectUrl, setSubjectUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    if (!baseSubject) { setSubjectUrl(''); return () => controller.abort(); }
    void (async () => {
      try {
        report?.('refining-mask');
        const input = await baseSubject.arrayBuffer();
        if (controller.signal.aborted) return;
        const result = await runWorker(new Worker(new URL('./mask-refine-worker.ts', import.meta.url), { type: 'module' }), { buffer: input, contentType: baseSubject.type, settings: mask }, [input], controller.signal);
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([result.buffer], { type: result.contentType }));
        setSubjectUrl(objectUrl);
        report?.('ready');
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (!controller.signal.aborted) { setSubjectUrl(''); report?.('error', error); }
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [baseSubject, mask.threshold, mask.feather, mask.expand]);
  return subjectUrl;
}

export function CardRenderer({ card, resolveArtworkUrl = identityArtworkUrl, interactive = true, className = '', subjectRefreshKey = 0, onArtworkPlacementChange, onArtworkLoad, onStatusChange }: CardRendererProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [flipped, setFlipped] = useState(false);
  const artworkUrl = useMemo(() => card.artwork.url ? resolveArtworkUrl(card.artwork.url) : '', [card.artwork.url, resolveArtworkUrl]);
  const subject = card.artwork.subject ?? { separated: false, mask: { threshold: 128, feather: 24, expand: 0 } };
  const baseSubject = useSeparatedSubject(artworkUrl, subject.separated, subjectRefreshKey, onStatusChange);
  const subjectUrl = useRefinedSubject(baseSubject, subject.mask, onStatusChange);
  const backUrl = cardBacks[card.appearance.back as keyof typeof cardBacks] || cardBacks.aurora;
  const style: RendererStyle = { '--art-x': `${card.artwork.x}%`, '--art-y': `${card.artwork.y}%`, '--art-scale': card.artwork.scale, '--mx': '50%', '--my': '50%', '--posx': '50%', '--posy': '50%', '--hyp': 0, '--rx': '0deg', '--ry': '0deg' };

  useEffect(() => {
    if (!artworkUrl) onStatusChange?.('idle');
    else if (!subject.separated) onStatusChange?.('loading-artwork');
  }, [artworkUrl, subject.separated]);

  function updateTilt(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || flipped || dragRef.current?.active) return;
    const shell = shellRef.current; if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const hyp = Math.min(1, Math.hypot(x - .5, y - .5) / Math.SQRT1_2);
    shell.style.setProperty('--mx', `${x * 100}%`); shell.style.setProperty('--my', `${y * 100}%`); shell.style.setProperty('--posx', `${x * 100}%`); shell.style.setProperty('--posy', `${y * 100}%`); shell.style.setProperty('--hyp', String(hyp)); shell.style.setProperty('--rx', `${(.5 - y) * 12}deg`); shell.style.setProperty('--ry', `${(x - .5) * 12}deg`);
  }
  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!onArtworkPlacementChange || flipped || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startX: card.artwork.x, startY: card.artwork.y, active: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId && onArtworkPlacementChange) {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (!drag.active && Math.hypot(dx, dy) >= 7) drag.active = true;
      if (drag.active) {
        const rect = event.currentTarget.getBoundingClientRect();
        onArtworkPlacementChange({ x: Math.max(0, Math.min(100, drag.startX + dx / rect.width * 100)), y: Math.max(0, Math.min(100, drag.startY + dy / rect.height * 100)) });
        return;
      }
    }
    updateTilt(event);
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.active;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }
  function resetTilt() { shellRef.current?.style.setProperty('--rx', '0deg'); shellRef.current?.style.setProperty('--ry', '0deg'); }
  function toggleFlip() { if (!interactive) return; resetTilt(); setFlipped((value) => !value); }
  function handleClick() { if (suppressClickRef.current) { suppressClickRef.current = false; return; } toggleFlip(); }

  return <div ref={shellRef} className={`holo-card-shell ${flipped ? 'is-flipped' : ''} ${onArtworkPlacementChange ? 'is-artwork-editable' : ''} ${className}`.trim()} style={style} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={resetTilt} onClick={handleClick} onKeyDown={(event) => { if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); toggleFlip(); }} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-pressed={interactive ? flipped : undefined} aria-label={interactive ? 'Flip card' : undefined}>
    <div className="holo-card-rotator">
      <article className={`card holo-card-face holo-card-front ${card.artwork.mode === 'frame' ? 'in-frame' : ''}`}>
        <div className="card-backdrop"/><div className="card-rays"/>
        {artworkUrl && <img className="art-layer art-background" src={artworkUrl} alt={card.artwork.name || 'Card artwork'} onLoad={(event) => { onArtworkLoad?.({ naturalWidth: event.currentTarget.naturalWidth, naturalHeight: event.currentTarget.naturalHeight }); if (!subject.separated) onStatusChange?.('ready'); }} onError={() => onStatusChange?.('error', new Error('Artwork failed to load'))}/>} 
        <div className="card background-effect" data-foil={card.appearance.backgroundFoil} aria-hidden="true"><div className="card-foil"/></div>
        {subjectUrl && <div className="art-layer art-subject-layer"><img className="subject-image" src={subjectUrl} alt={`${card.artwork.name || 'Card artwork'} foreground`}/>{card.appearance.subjectFoil !== 'none' && <div className="card subject-effect" data-foil={card.appearance.subjectFoil} style={{ maskImage: `url(${subjectUrl})`, WebkitMaskImage: `url(${subjectUrl})` }} aria-hidden="true"><div className="card-foil"/></div>}</div>}
        <div className="card-glare"/><div className="card-copy"><span className="serial">HS–001</span><div><span className="rarity">PRISMATIC</span><h3>{card.artwork.name || 'UNTITLED'}</h3></div></div>
      </article>
      <div className="holo-card-face holo-card-back" aria-hidden={!flipped}><img src={backUrl} alt={`${card.appearance.back} card back`}/></div>
    </div>
  </div>;
}
