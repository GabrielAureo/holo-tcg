import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { CardDefinition } from '@holo/card-schema';
import './index.css';

const cardBacks = {
  aurora: new URL('../assets/card-backs/aurora.svg', import.meta.url).href,
  cosmic: new URL('../assets/card-backs/cosmic.svg', import.meta.url).href,
  gold: new URL('../assets/card-backs/gold.svg', import.meta.url).href,
  minimal: new URL('../assets/card-backs/minimal.svg', import.meta.url).href,
} as const;

export type CardRendererStatus = 'idle' | 'loading-artwork' | 'separating-subject' | 'refining-mask' | 'ready' | 'error';
export interface CardRendererProps {
  card: CardDefinition;
  resolveArtworkUrl?: (url: string) => string;
  interactive?: boolean;
  className?: string;
  onStatusChange?: (status: CardRendererStatus, error?: Error) => void;
}
type RendererStyle = CSSProperties & Record<`--${string}`, string | number>;

function runWorker(worker: Worker, payload: Record<string, unknown>, transfer: Transferable[] = []) {
  return new Promise<{ buffer: ArrayBuffer; contentType: string }>((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => worker.terminate();
    worker.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.id !== id || message.type === 'progress') return;
      cleanup();
      if (message.type === 'done') resolve({ buffer: message.buffer, contentType: message.contentType || 'image/png' });
      else reject(new Error(message.message || 'Card rendering worker failed'));
    });
    worker.addEventListener('error', (event) => { cleanup(); reject(new Error(event.message || 'Card rendering worker failed')); }, { once: true });
    worker.postMessage({ ...payload, id }, transfer);
  });
}

function useSubject(card: CardDefinition, artworkUrl: string, onStatusChange?: CardRendererProps['onStatusChange']) {
  const [subjectUrl, setSubjectUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const subject = card.artwork.subject;
    if (!subject?.separated || !artworkUrl) { setSubjectUrl(''); return; }
    void (async () => {
      try {
        onStatusChange?.('loading-artwork');
        const response = await fetch(artworkUrl, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Artwork request returned ${response.status}`);
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const input = await response.arrayBuffer();
        onStatusChange?.('separating-subject');
        const separated = await runWorker(new Worker(new URL('./subject-worker.ts', import.meta.url), { type: 'module' }), { buffer: input, contentType }, [input]);
        if (cancelled) return;
        onStatusChange?.('refining-mask');
        const refined = await runWorker(new Worker(new URL('./mask-refine-worker.ts', import.meta.url), { type: 'module' }), { buffer: separated.buffer, contentType: separated.contentType, settings: subject.mask }, [separated.buffer]);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([refined.buffer], { type: refined.contentType }));
        setSubjectUrl(objectUrl);
        onStatusChange?.('ready');
      } catch (cause) {
        if (cancelled) return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        setSubjectUrl(''); onStatusChange?.('error', error);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [artworkUrl, card.artwork.subject]);
  return subjectUrl;
}

export function CardRenderer({ card, resolveArtworkUrl = (url) => url, interactive = true, className = '', onStatusChange }: CardRendererProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const artworkUrl = useMemo(() => card.artwork.url ? resolveArtworkUrl(card.artwork.url) : '', [card.artwork.url, resolveArtworkUrl]);
  const subjectUrl = useSubject(card, artworkUrl, onStatusChange);
  const backUrl = cardBacks[card.appearance.back as keyof typeof cardBacks] || cardBacks.aurora;
  const style: RendererStyle = { '--art-x': `${card.artwork.x}%`, '--art-y': `${card.artwork.y}%`, '--art-scale': card.artwork.scale, '--mx': '50%', '--my': '50%', '--posx': '50%', '--posy': '50%', '--hyp': 0, '--rx': '0deg', '--ry': '0deg' };

  useEffect(() => {
    if (!artworkUrl) onStatusChange?.('idle');
    else if (!card.artwork.subject?.separated) onStatusChange?.('loading-artwork');
  }, [artworkUrl, card.artwork.subject?.separated]);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || flipped) return;
    const shell = shellRef.current; if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const hyp = Math.min(1, Math.hypot(x - .5, y - .5) / Math.SQRT1_2);
    shell.style.setProperty('--mx', `${x * 100}%`); shell.style.setProperty('--my', `${y * 100}%`); shell.style.setProperty('--posx', `${x * 100}%`); shell.style.setProperty('--posy', `${y * 100}%`); shell.style.setProperty('--hyp', String(hyp)); shell.style.setProperty('--rx', `${(.5 - y) * 12}deg`); shell.style.setProperty('--ry', `${(x - .5) * 12}deg`);
  }
  function resetTilt() { shellRef.current?.style.setProperty('--rx', '0deg'); shellRef.current?.style.setProperty('--ry', '0deg'); }
  function toggleFlip() { if (!interactive) return; resetTilt(); setFlipped((value) => !value); }

  return <div ref={shellRef} className={`holo-card-shell ${flipped ? 'is-flipped' : ''} ${className}`.trim()} style={style} onPointerMove={handlePointerMove} onPointerLeave={resetTilt} onClick={toggleFlip} onKeyDown={(event) => { if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); toggleFlip(); }} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-pressed={interactive ? flipped : undefined} aria-label={interactive ? 'Flip card' : undefined}>
    <div className="holo-card-rotator">
      <article className={`card holo-card-face holo-card-front ${card.artwork.mode === 'frame' ? 'in-frame' : ''}`} data-foil={card.appearance.backgroundFoil}>
        <div className="card-backdrop"/><div className="card-rays"/>{artworkUrl && <img className="art-layer art-background" src={artworkUrl} alt={card.artwork.name || 'Card artwork'} onLoad={() => { if (!card.artwork.subject?.separated) onStatusChange?.('ready'); }} onError={() => onStatusChange?.('error', new Error('Artwork failed to load'))}/>}<div className="card-foil"/>
        {subjectUrl && <div className="art-layer art-subject-layer"><img className="subject-image" src={subjectUrl} alt={`${card.artwork.name || 'Card artwork'} foreground`}/>{card.appearance.subjectFoil !== 'none' && <div className="card subject-effect" data-foil={card.appearance.subjectFoil} style={{ maskImage: `url(${subjectUrl})`, WebkitMaskImage: `url(${subjectUrl})` }} aria-hidden="true"><div className="card-foil"/></div>}</div>}
        <div className="card-glare"/><div className="card-copy"><span className="serial">HS–001</span><div><span className="rarity">PRISMATIC</span><h3>{card.artwork.name || 'UNTITLED'}</h3></div></div>
      </article>
      <div className="holo-card-face holo-card-back" aria-hidden={!flipped}><img src={backUrl} alt={`${card.appearance.back} card back`}/></div>
    </div>
  </div>;
}
