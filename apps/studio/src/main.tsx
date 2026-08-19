import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CardRenderer, HoloEffectPreview, type ArtworkMetrics, type CardRendererStatus } from '@holo/card-renderer';
import type { CardDefinition } from '@holo/card-schema';
import './style.css';
import './subject-controls.css';

const FOILS = [
  ['classic', 'Holo'], ['galaxy', 'Galaxy'], ['holo-v', 'Holo V'], ['prism', 'VMAX'], ['vstar', 'VSTAR'],
  ['ultra', 'Full / Alt Art'], ['trainer', 'Trainer Full Art'], ['fullart', 'Rainbow'], ['rainbow-alt', 'Rainbow Alt'],
  ['gold', 'Gold / Secret'], ['radiant', 'Radiant'], ['gallery', 'Trainer Gallery'], ['gallery-v', 'Gallery V'], ['gallery-vmax', 'Gallery VMAX'],
] as const;
const BACKS = ['aurora', 'cosmic', 'gold', 'minimal'] as const;
const FOIL_IDS = new Set<string>(FOILS.map(([id]) => id));
const BACK_IDS = new Set<string>(BACKS);
const DEFAULT_MASK = { threshold: 128, feather: 24, expand: 0 } as const;

type Post = { id: number; tag_string_character?: string; image_width: number; image_height: number; preview_file_url?: string; large_file_url?: string; file_url?: string };
type TagSuggestion = { name: string; post_count?: number | null };
type HoloLayer = 'background' | 'subject';
type MaskSettings = NonNullable<CardDefinition['artwork']['subject']>['mask'];

function proxied(url: string) { return url ? `/api/image?url=${encodeURIComponent(url)}` : ''; }
function postImage(post: Post) { return post.large_file_url || post.file_url || post.preview_file_url || ''; }
function postPreview(post: Post) { return post.preview_file_url || post.large_file_url || post.file_url || ''; }
function friendlyName(post: Post) { const tag = post.tag_string_character?.split(' ')[0] || 'untitled character'; return tag.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function safeNumber(value: string | null, fallback: number, min: number, max: number) { const parsed = Number(value); return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback; }
function normalizeTag(value: string) { return value.trim().replace(/\s+/g, '_'); }

function defaultCard(): CardDefinition {
  return { version: 1, artwork: { url: '', name: 'SELECT AN ARTWORK', x: 50, y: 48, scale: 1, mode: 'full', subject: { separated: false, mask: { ...DEFAULT_MASK } } }, appearance: { backgroundFoil: 'classic', subjectFoil: 'none', back: 'aurora' } };
}

function cardFromQuery(): CardDefinition {
  const card = defaultCard();
  const q = new URLSearchParams(location.search);
  const image = q.get('img');
  if (!image) return card;
  card.artwork.url = image;
  card.artwork.name = q.get('name') || 'Shared artwork';
  card.artwork.x = safeNumber(q.get('x'), 50, 0, 100);
  card.artwork.y = safeNumber(q.get('y'), 48, 0, 100);
  card.artwork.scale = safeNumber(q.get('scale'), 1, .5, 2.2);
  card.artwork.mode = q.get('mode') === 'frame' ? 'frame' : 'full';
  card.artwork.subject = { separated: q.get('separated') === '1', mask: { threshold: safeNumber(q.get('maskThreshold'), 128, 0, 255), feather: safeNumber(q.get('maskFeather'), 24, 0, 127), expand: safeNumber(q.get('maskExpand'), 0, -8, 8) } };
  const backgroundFoil = q.get('foil');
  const subjectFoil = q.get('subjectFoil');
  const back = q.get('back');
  card.appearance.backgroundFoil = backgroundFoil && FOIL_IDS.has(backgroundFoil) ? backgroundFoil : 'classic';
  card.appearance.subjectFoil = subjectFoil && FOIL_IDS.has(subjectFoil) ? subjectFoil : 'none';
  card.appearance.back = back && BACK_IDS.has(back) ? back : 'aurora';
  return card;
}

function syncQuery(card: CardDefinition) {
  if (!card.artwork.url) return history.replaceState(null, '', location.pathname);
  const q = new URLSearchParams();
  q.set('img', card.artwork.url); if (card.artwork.name) q.set('name', card.artwork.name);
  q.set('foil', card.appearance.backgroundFoil); q.set('back', card.appearance.back); q.set('mode', card.artwork.mode);
  q.set('x', String(Math.round(card.artwork.x * 100) / 100)); q.set('y', String(Math.round(card.artwork.y * 100) / 100)); q.set('scale', String(Math.round(card.artwork.scale * 100) / 100));
  if (card.artwork.subject?.separated) { q.set('separated', '1'); q.set('maskThreshold', String(card.artwork.subject.mask.threshold)); q.set('maskFeather', String(card.artwork.subject.mask.feather)); q.set('maskExpand', String(card.artwork.subject.mask.expand)); q.set('subjectFoil', card.appearance.subjectFoil); }
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

function Studio() {
  const [card, setCard] = useState<CardDefinition>(() => cardFromQuery());
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tags, setTags] = useState(['hololive', 'solo']);
  const [tagInput, setTagInput] = useState('');
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [page, setPage] = useState(1);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [renderStatus, setRenderStatus] = useState<CardRendererStatus>('idle');
  const [renderError, setRenderError] = useState('');
  const [subjectRefreshKey, setSubjectRefreshKey] = useState(0);
  const [activeHoloLayer, setActiveHoloLayer] = useState<HoloLayer>('background');
  const [maskOpen, setMaskOpen] = useState(false);
  const [pendingMask, setPendingMask] = useState<MaskSettings>(() => ({ ...(card.artwork.subject?.mask ?? DEFAULT_MASK) }));
  const suggestionTimer = useRef<number | undefined>(undefined);
  const autoFitNextArtwork = useRef(false);
  const hasArtwork = Boolean(card.artwork.url);

  useEffect(() => { syncQuery(card); }, [card]);
  useEffect(() => { void loadPosts(false, 1, 'hololive solo'); }, []);
  useEffect(() => { if (!card.artwork.subject?.separated) setActiveHoloLayer('background'); }, [card.artwork.subject?.separated]);

  async function loadPosts(append: boolean, requestedPage: number, query: string) {
    setLoadingPosts(true);
    try {
      const response = await fetch(`/api/posts?q=${encodeURIComponent(query.trim())}&page=${requestedPage}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'The imageboard could not be reached.');
      setPosts((previous) => append ? [...previous, ...payload] : payload); setPage(requestedPage);
    } catch (error) {
      if (!append) setPosts([]);
      setRenderError(error instanceof Error ? error.message : String(error));
    } finally { setLoadingPosts(false); }
  }

  function selectPost(post: Post) {
    autoFitNextArtwork.current = true;
    setActiveHoloLayer('background');
    setMaskOpen(false);
    setPendingMask({ ...DEFAULT_MASK });
    setSelectedId(post.id);
    setCard((current) => ({ ...current, artwork: { ...current.artwork, url: postImage(post), name: friendlyName(post), subject: { separated: false, mask: { ...DEFAULT_MASK } } }, appearance: { ...current.appearance, subjectFoil: 'none' } }));
  }
  function patchArtwork(patch: Partial<CardDefinition['artwork']>) { setCard((current) => ({ ...current, artwork: { ...current.artwork, ...patch } })); }
  function patchAppearance(patch: Partial<CardDefinition['appearance']>) { setCard((current) => ({ ...current, appearance: { ...current.appearance, ...patch } })); }
  function patchPendingMask(patch: Partial<MaskSettings>) { setPendingMask((current) => ({ ...current, ...patch })); }

  function addTag(value: string) {
    const tag = normalizeTag(value); if (!tag || tags.includes(tag)) return tags;
    const next = [...tags, tag]; setTags(next); setTagInput(''); setSuggestions([]); return next;
  }
  async function requestSuggestions(value: string) {
    setTagInput(value); window.clearTimeout(suggestionTimer.current); if (!value.trim()) return setSuggestions([]);
    suggestionTimer.current = window.setTimeout(async () => { const response = await fetch(`/api/tags?q=${encodeURIComponent(value.trim())}`); if (response.ok) setSuggestions((await response.json()).filter((item: TagSuggestion) => !tags.includes(item.name))); }, 180);
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const nextTags = tagInput.trim() ? addTag(tagInput) : tags;
    void loadPosts(false, 1, nextTags.join(' '));
  }
  function separateSubject() {
    setCard((current) => ({ ...current, artwork: { ...current.artwork, subject: { separated: true, mask: { ...pendingMask } } } }));
    setSubjectRefreshKey((value) => value + 1);
  }
  function resetPendingMask() { setPendingMask({ ...DEFAULT_MASK }); }
  function handleArtworkLoad({ naturalWidth, naturalHeight }: ArtworkMetrics) {
    if (!autoFitNextArtwork.current || !naturalWidth || !naturalHeight) return;
    autoFitNextArtwork.current = false;
    const imageAspect = naturalWidth / naturalHeight;
    const baseHeight = card.artwork.mode === 'frame' ? 1 : .78;
    const coverScale = Math.max(.714 / (baseHeight * imageAspect), 1 / baseHeight);
    patchArtwork({ x: 50, y: 50, scale: clamp(coverScale, .5, 2.2) });
  }
  const handleRendererStatus = useCallback((status: CardRendererStatus, error?: Error) => { setRenderStatus(status); setRenderError(error?.message || ''); }, []);

  const subject = card.artwork.subject ?? { separated: false, mask: { ...DEFAULT_MASK } };
  const busy = ['loading-artwork', 'separating-subject', 'refining-mask'].includes(renderStatus);
  const activeFoil = activeHoloLayer === 'subject' ? card.appearance.subjectFoil : card.appearance.backgroundFoil;
  const chooseFoil = (foil: string) => activeHoloLayer === 'subject' ? patchAppearance({ subjectFoil: foil }) : patchAppearance({ backgroundFoil: foil });

  return <>
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">H</span><span>HOLO / STUDIO</span></a><div className="status"><i /> Browser processing · images stay local</div></header>
    <main><section className="intro"><p className="eyebrow">Holographic card composer</p><h1>Turn character art into<br/><em>a collectible moment.</em></h1><p>Browse anime artwork, separate its subject locally, and apply interactive holographic finishes.</p></section>
      <div className="workspace">
        <aside className="panel library"><div className="panel-head"><div><span className="step">01</span><h2>Find artwork</h2></div><span className="source">DANBOORU</span></div>
          <form className="search" autoComplete="off" onSubmit={submitSearch}><div className="tag-editor"><div className="tag-chips">{tags.map((tag, index) => <button type="button" className="tag-chip" key={tag} onClick={() => setTags(tags.filter((_, i) => i !== index))}><span>{tag}</span><b>×</b></button>)}</div><input aria-label="Add search tag" placeholder="Add a tag…" value={tagInput} onChange={(e) => void requestSuggestions(e.target.value)} />{suggestions.length > 0 && <div className="tag-suggestions">{suggestions.map((item) => <button type="button" className="tag-suggestion" key={item.name} onClick={() => addTag(item.name)}><span>{item.name}</span><small>{item.post_count?.toLocaleString()}</small></button>)}</div>}</div><button type="submit">↗</button></form>
          <div className="gallery">{loadingPosts && !posts.length ? <div className="loading">Loading artwork…</div> : posts.map((post) => <button className={`thumb ${selectedId === post.id ? 'selected' : ''}`} key={post.id} onClick={() => selectPost(post)}>{postPreview(post) ? <img src={proxied(postPreview(post))} loading="lazy" alt={friendlyName(post)} /> : <div className="thumb-missing">NO IMAGE</div>}<span>{post.image_height > post.image_width * 1.15 ? 'PORTRAIT' : 'ART'}</span></button>)}</div>
          <button className="more" disabled={loadingPosts} onClick={() => void loadPosts(true, page + 1, tags.join(' '))}>Load more</button><small>Artwork is served by Danbooru and belongs to its respective artists.</small></aside>

        <section className="stage" aria-label="Card preview"><CardRenderer className="studio-card-preview" card={card} resolveArtworkUrl={proxied} interactive={hasArtwork} subjectRefreshKey={subjectRefreshKey} onArtworkPlacementChange={hasArtwork ? ({ x, y }) => patchArtwork({ x, y }) : undefined} onArtworkLoad={handleArtworkLoad} onStatusChange={handleRendererStatus} />{busy && <div className="shared-card-loader"><span className="spinner"/><span>{renderStatus === 'separating-subject' ? 'Separating subject…' : renderStatus === 'refining-mask' ? 'Refining mask…' : 'Loading card…'}</span></div>}<p className="hint">Drag to place · move to shift the light · click to flip</p></section>

        <aside className="panel controls"><div className="panel-head"><div><span className="step">02</span><h2>Compose</h2></div></div>
          <fieldset><legend>Holo style</legend><div className="layer-tabs" role="tablist" aria-label="Card layer"><button type="button" className={`layer-tab ${activeHoloLayer === 'background' ? 'active' : ''}`} role="tab" aria-selected={activeHoloLayer === 'background'} onClick={() => setActiveHoloLayer('background')}>Background</button>{subject.separated && <button type="button" className={`layer-tab ${activeHoloLayer === 'subject' ? 'active' : ''}`} role="tab" aria-selected={activeHoloLayer === 'subject'} onClick={() => setActiveHoloLayer('subject')}>Subject</button>}</div><div className="holo-picker">{activeHoloLayer === 'subject' && <button type="button" className={`holo-choice ${activeFoil === 'none' ? 'active' : ''}`} onClick={() => chooseFoil('none')}><span>None</span></button>}{FOILS.map(([id, label]) => <button type="button" key={id} className={`holo-choice ${activeFoil === id ? 'active' : ''}`} onClick={() => chooseFoil(id)}><HoloEffectPreview foil={id}/><span>{label}</span></button>)}</div></fieldset>

          <div className="subject-separation-control">
            <div className="subject-separation-actions">
              <button className="primary subject-separation-button" disabled={!hasArtwork || busy} onClick={separateSubject}><span>✦</span> {subject.separated ? 'Separate again' : 'Separate subject'}</button>
              <button type="button" className={`subject-settings-toggle ${maskOpen ? 'open' : ''}`} aria-label="Toggle mask refinement settings" aria-expanded={maskOpen} onClick={() => setMaskOpen((open) => !open)}>⌄</button>
            </div>
            {maskOpen && <div className="subject-settings-panel"><div className="subject-settings-heading"><span>Mask refinement</span><small>Applied on the next separation</small></div><div className="mask-control"><label>Threshold <output>{pendingMask.threshold}</output></label><input type="range" min="0" max="255" value={pendingMask.threshold} onChange={(e) => patchPendingMask({ threshold: Number(e.target.value) })}/></div><div className="mask-control"><label>Feather <output>{pendingMask.feather}</output></label><input type="range" min="0" max="127" value={pendingMask.feather} onChange={(e) => patchPendingMask({ feather: Number(e.target.value) })}/></div><div className="mask-control"><label>Expand <output>{pendingMask.expand}</output></label><input type="range" min="-8" max="8" value={pendingMask.expand} onChange={(e) => patchPendingMask({ expand: Number(e.target.value) })}/></div><button type="button" className="mask-reset" onClick={resetPendingMask}>Reset mask settings</button></div>}
          </div>

          <fieldset><legend>Card back</legend><div className="back-picker">{BACKS.map((back) => <button type="button" key={back} className={`back-option ${card.appearance.back === back ? 'active' : ''}`} onClick={() => patchAppearance({ back })}><span>{back}</span></button>)}</div></fieldset>
          <fieldset><legend>Art treatment</legend><div className="segmented"><button className={card.artwork.mode === 'full' ? 'active' : ''} onClick={() => patchArtwork({ mode: 'full' })}>Full body</button><button className={card.artwork.mode === 'frame' ? 'active' : ''} onClick={() => patchArtwork({ mode: 'frame' })}>In frame</button></div></fieldset>
          <div className="control"><label>Artwork scale <output>{Math.round(card.artwork.scale * 100)}%</output></label><input type="range" min="50" max="220" value={card.artwork.scale * 100} onChange={(e) => patchArtwork({ scale: Number(e.target.value) / 100 })}/></div>
          <div className="control"><label>Horizontal <output>{Math.round(card.artwork.x)}%</output></label><input type="range" min="0" max="100" value={card.artwork.x} onChange={(e) => patchArtwork({ x: Number(e.target.value) })}/></div>
          <div className="control"><label>Vertical <output>{Math.round(card.artwork.y)}%</output></label><input type="range" min="0" max="100" value={card.artwork.y} onChange={(e) => patchArtwork({ y: Number(e.target.value) })}/></div>
          {renderError && <p className="process-note">{renderError}</p>}<button className="secondary" onClick={() => patchArtwork({ x: 50, y: 48, scale: 1 })}>Reset placement</button></aside>
      </div></main>
  </>;
}

createRoot(document.getElementById('app')!).render(<Studio />);
