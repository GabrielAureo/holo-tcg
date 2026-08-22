import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { CardRenderer, HoloEffectPreview, type ArtworkMetrics, type CardRendererStatus } from '@holo/card-renderer';
import type { CardDefinition, CardLayout } from '@holo/card-schema';
import { EditableNumber } from './components/editable-number';
import { Button } from './components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible';
import { Slider } from './components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { cn } from './lib/utils';
import './style.css';

const FOILS = [
  ['classic', 'Holo'], ['galaxy', 'Galaxy'], ['holo-v', 'Holo V'], ['prism', 'VMAX'], ['vstar', 'VSTAR'],
  ['ultra', 'Full / Alt Art'], ['trainer', 'Trainer Full Art'], ['fullart', 'Rainbow'], ['rainbow-alt', 'Rainbow Alt'],
  ['gold', 'Gold / Secret'], ['radiant', 'Radiant'], ['gallery', 'Trainer Gallery'], ['gallery-v', 'Gallery V'], ['gallery-vmax', 'Gallery VMAX'],
] as const;
const BACKS = ['aurora', 'cosmic', 'gold', 'minimal'] as const;
const FOIL_IDS = new Set<string>(FOILS.map(([id]) => id));
const BACK_IDS = new Set<string>(BACKS);
const DEFAULT_MASK = { threshold: 128, feather: 24, expand: 0 } as const;

const monoLabel = 'font-mono text-[10px] uppercase tracking-[.06em] text-[#9a9ca6]';
const fieldsetClass = 'm-[4px_0_28px] border-0 p-0';
const textFieldClass = 'w-full border border-[#30333e] bg-[#11131b] px-3 py-2.5 font-sans text-[12px] text-[#e8e9ed] outline-none transition-colors placeholder:text-[#555966] focus:border-[var(--acid)]';

type Post = { id: number; tag_string_character?: string; image_width: number; image_height: number; preview_file_url?: string; large_file_url?: string; file_url?: string };
type TagSuggestion = { name: string; post_count?: number | null };
type HoloLayer = 'background' | 'subject' | 'frame';
type MaskSettings = NonNullable<CardDefinition['artwork']['subject']>['mask'];

function proxied(url: string) { return url ? `/api/image?url=${encodeURIComponent(url)}` : ''; }
function postImage(post: Post) { return post.large_file_url || post.file_url || post.preview_file_url || ''; }
function postPreview(post: Post) { return post.preview_file_url || post.large_file_url || post.file_url || ''; }
function friendlyName(post: Post) { const tag = post.tag_string_character?.split(' ')[0] || 'untitled character'; return tag.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function safeNumber(value: string | null, fallback: number, min: number, max: number) { const parsed = Number(value); return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback; }
function normalizeTag(value: string) { return value.trim().replace(/\s+/g, '_'); }

function defaultCard(): CardDefinition {
  return {
    version: 2,
    layout: 'full-art',
    artwork: { url: '', name: 'SELECT AN ARTWORK', x: 50, y: 48, scale: 1, subject: { separated: false, mask: { ...DEFAULT_MASK } } },
    content: { name: 'SELECT AN ARTWORK', attack: 100, defense: 100, description: '' },
    appearance: { backgroundFoil: 'classic', subjectFoil: 'none', frameFoil: 'none', back: 'aurora' },
  };
}

function cardFromQuery(): CardDefinition {
  const card = defaultCard();
  const q = new URLSearchParams(location.search);
  const image = q.get('img');
  if (!image) return card;
  const legacyName = q.get('name') || 'Shared artwork';
  card.artwork.url = image;
  card.artwork.name = legacyName;
  card.artwork.x = safeNumber(q.get('x'), 50, 0, 100);
  card.artwork.y = safeNumber(q.get('y'), 48, 0, 100);
  card.artwork.scale = safeNumber(q.get('scale'), 1, .5, 2.2);
  card.layout = q.get('layout') === 'standard' || q.get('mode') === 'frame' ? 'standard' : 'full-art';
  card.content.name = q.get('cardName') || legacyName;
  card.content.attack = Math.round(safeNumber(q.get('attack'), 100, 0, 9999));
  card.content.defense = Math.round(safeNumber(q.get('defense'), 100, 0, 9999));
  card.content.description = q.get('description') || '';
  card.artwork.subject = { separated: q.get('separated') === '1', mask: { threshold: safeNumber(q.get('maskThreshold'), 128, 0, 255), feather: safeNumber(q.get('maskFeather'), 24, 0, 127), expand: safeNumber(q.get('maskExpand'), 0, -8, 8) } };
  const backgroundFoil = q.get('foil');
  const subjectFoil = q.get('subjectFoil');
  const frameFoil = q.get('frameFoil');
  const back = q.get('back');
  card.appearance.backgroundFoil = backgroundFoil && FOIL_IDS.has(backgroundFoil) ? backgroundFoil : 'classic';
  card.appearance.subjectFoil = subjectFoil && FOIL_IDS.has(subjectFoil) ? subjectFoil : 'none';
  card.appearance.frameFoil = frameFoil && FOIL_IDS.has(frameFoil) ? frameFoil : 'none';
  card.appearance.back = back && BACK_IDS.has(back) ? back : 'aurora';
  return card;
}

function syncQuery(card: CardDefinition) {
  if (!card.artwork.url) return history.replaceState(null, '', location.pathname);
  const q = new URLSearchParams();
  q.set('img', card.artwork.url); if (card.artwork.name) q.set('name', card.artwork.name);
  q.set('layout', card.layout); q.set('cardName', card.content.name); q.set('attack', String(card.content.attack)); q.set('defense', String(card.content.defense));
  if (card.content.description) q.set('description', card.content.description);
  q.set('foil', card.appearance.backgroundFoil); q.set('back', card.appearance.back);
  if (card.layout === 'standard' && card.appearance.frameFoil !== 'none') q.set('frameFoil', card.appearance.frameFoil);
  q.set('x', String(Math.round(card.artwork.x * 100) / 100)); q.set('y', String(Math.round(card.artwork.y * 100) / 100)); q.set('scale', String(Math.round(card.artwork.scale * 100) / 100));
  if (card.artwork.subject?.separated) { q.set('separated', '1'); q.set('maskThreshold', String(card.artwork.subject.mask.threshold)); q.set('maskFeather', String(card.artwork.subject.mask.feather)); q.set('maskExpand', String(card.artwork.subject.mask.expand)); q.set('subjectFoil', card.appearance.subjectFoil); }
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

function SectionHeader({ step, title, source }: { step: string; title: string; source?: string }) {
  return <div className="mb-[22px] flex items-start justify-between"><div className="flex items-center gap-[11px]"><span className="font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[var(--acid)]">{step}</span><h2 className="m-0 font-sans text-[15px] font-bold">{title}</h2></div>{source && <span className="border border-[var(--line)] px-[7px] py-[5px] font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[#666976]">{source}</span>}</div>;
}

function MaskControl({ label, value, min, max, onChange, warnLow = false }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; warnLow?: boolean }) {
  return <div className="my-3.5">
    <div className="mb-2.5 flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[.06em] text-[#9a9ca6]">
      <span className="flex items-center gap-1.5">{label}{warnLow && value < 10 && <span className="group relative inline-flex" tabIndex={0} aria-label="Low threshold values may cause artifacts around the subject"><TriangleAlert className="size-3.5 text-amber-400" aria-hidden="true"/><span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-50 w-52 -translate-x-1/2 bg-[#090a10] px-2.5 py-2 text-center font-sans text-[11px] normal-case tracking-normal text-[#d9dbe2] opacity-0 shadow-[0_8px_24px_#000c] transition-opacity group-hover:opacity-100 group-focus:opacity-100">Low threshold values may cause artifacts around the subject.</span></span>}</span>
      <EditableNumber label={label} value={value} min={min} max={max} onChange={onChange}/>
    </div>
    <Slider min={min} max={max} step={1} value={[value]} onValueChange={([next]) => onChange(next)}/>
  </div>;
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
  useEffect(() => {
    if ((activeHoloLayer === 'subject' && !card.artwork.subject?.separated) || (activeHoloLayer === 'frame' && card.layout !== 'standard')) setActiveHoloLayer('background');
  }, [activeHoloLayer, card.artwork.subject?.separated, card.layout]);

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
    const name = friendlyName(post);
    autoFitNextArtwork.current = true;
    setActiveHoloLayer('background');
    setMaskOpen(false);
    setPendingMask({ ...DEFAULT_MASK });
    setSelectedId(post.id);
    setCard((current) => ({ ...current, artwork: { ...current.artwork, url: postImage(post), name, subject: { separated: false, mask: { ...DEFAULT_MASK } } }, content: { ...current.content, name }, appearance: { ...current.appearance, subjectFoil: 'none' } }));
  }
  function patchArtwork(patch: Partial<CardDefinition['artwork']>) { setCard((current) => ({ ...current, artwork: { ...current.artwork, ...patch } })); }
  function patchContent(patch: Partial<CardDefinition['content']>) { setCard((current) => ({ ...current, content: { ...current.content, ...patch } })); }
  function patchAppearance(patch: Partial<CardDefinition['appearance']>) { setCard((current) => ({ ...current, appearance: { ...current.appearance, ...patch } })); }
  function setLayout(layout: CardLayout) { setCard((current) => ({ ...current, layout })); }
  function patchPendingMask(patch: Partial<MaskSettings>) { setPendingMask((current) => ({ ...current, ...patch })); }
  function addTag(value: string) { const tag = normalizeTag(value); if (!tag || tags.includes(tag)) return tags; const next = [...tags, tag]; setTags(next); setTagInput(''); setSuggestions([]); return next; }
  async function requestSuggestions(value: string) { setTagInput(value); window.clearTimeout(suggestionTimer.current); if (!value.trim()) return setSuggestions([]); suggestionTimer.current = window.setTimeout(async () => { const response = await fetch(`/api/tags?q=${encodeURIComponent(value.trim())}`); if (response.ok) setSuggestions((await response.json()).filter((item: TagSuggestion) => !tags.includes(item.name))); }, 180); }
  function submitSearch(event: FormEvent) { event.preventDefault(); const nextTags = tagInput.trim() ? addTag(tagInput) : tags; void loadPosts(false, 1, nextTags.join(' ')); }
  function separateSubject() { setCard((current) => ({ ...current, artwork: { ...current.artwork, subject: { separated: true, mask: { ...pendingMask } } } })); setSubjectRefreshKey((value) => value + 1); }
  function resetPendingMask() { setPendingMask({ ...DEFAULT_MASK }); }
  function handleArtworkLoad({ naturalWidth, naturalHeight }: ArtworkMetrics) {
    if (!autoFitNextArtwork.current || !naturalWidth || !naturalHeight) return;
    autoFitNextArtwork.current = false;
    if (card.layout === 'standard') return patchArtwork({ x: 50, y: 50, scale: 1 });
    const imageAspect = naturalWidth / naturalHeight;
    const coverScale = Math.max(.714 / (.78 * imageAspect), 1 / .78);
    patchArtwork({ x: 50, y: 50, scale: clamp(coverScale, .5, 2.2) });
  }
  const handleRendererStatus = useCallback((status: CardRendererStatus, error?: Error) => { setRenderStatus(status); setRenderError(error?.message || ''); }, []);

  const subject = card.artwork.subject ?? { separated: false, mask: { ...DEFAULT_MASK } };
  const busy = ['loading-artwork', 'separating-subject', 'refining-mask'].includes(renderStatus);
  const disabled = !hasArtwork || busy;
  const activeFoil = activeHoloLayer === 'subject' ? card.appearance.subjectFoil : activeHoloLayer === 'frame' ? card.appearance.frameFoil : card.appearance.backgroundFoil;
  const chooseFoil = (foil: string) => activeHoloLayer === 'subject' ? patchAppearance({ subjectFoil: foil }) : activeHoloLayer === 'frame' ? patchAppearance({ frameFoil: foil }) : patchAppearance({ backgroundFoil: foil });
  const holoTabsClass = card.layout === 'standard' && subject.separated ? 'grid-cols-3' : card.layout === 'standard' || subject.separated ? 'grid-cols-2' : 'grid-cols-1';

  return <>
    <header className="flex h-[76px] items-center justify-between border-b border-[var(--line)] px-[3vw]">
      <a className="flex items-center gap-3 font-mono text-[13px] font-semibold tracking-[.12em] text-white no-underline" href="#"><span className="grid size-8 place-items-center bg-[var(--acid)] font-bold text-[#111] [clip-path:polygon(25%_0,100%_0,75%_100%,0_100%)]">H</span><span>HOLO / STUDIO</span></a>
      <div className="font-mono text-[10px] uppercase tracking-[.08em] text-[var(--muted)] max-[700px]:hidden"><i className="mr-[7px] inline-block size-1.5 rounded-full bg-[var(--acid)] shadow-[0_0_8px_var(--acid)]" />Browser processing · images stay local</div>
    </header>

    <main className="mx-auto max-w-[1600px] px-[3vw] pb-20 pt-14 font-sans max-[700px]:px-3.5 max-[700px]:pt-[38px]">
      <section className="mx-auto mb-[45px] max-w-[760px] text-center max-[700px]:text-left">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[var(--acid)]">Holographic card composer</p>
        <h1 className="my-[14px] font-sans text-[clamp(38px,5vw,70px)] font-bold leading-[1.02] tracking-[-.055em]">Turn character art into<br className="max-[700px]:hidden"/><em className="font-display font-semibold italic text-[#b9bbc4]">a collectible moment.</em></h1>
        <p className="mx-auto max-w-[580px] text-sm leading-[1.7] text-[#92949f] max-[700px]:mx-0">Browse anime artwork, separate its subject locally, and apply interactive holographic finishes.</p>
      </section>

      <div className="grid min-h-[680px] grid-cols-[minmax(250px,320px)_minmax(380px,1fr)_minmax(250px,320px)] border border-[var(--line)] bg-[#0c0d14] max-[1000px]:grid-cols-[280px_1fr] max-[700px]:flex max-[700px]:flex-col min-[1001px]:h-[680px] min-[1001px]:min-h-0">
        <aside className="min-h-0 border-r border-[var(--line)] bg-[#0d0e15] p-[26px] max-[700px]:border-b max-[700px]:border-r-0">
          <SectionHeader step="01" title="Find artwork" source="DANBOORU" />
          <form className="flex items-stretch border border-[#323440] bg-[#11121b] focus-within:border-[#707482]" autoComplete="off" onSubmit={submitSearch}>
            <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-[5px] p-[7px]">
              {tags.map((tag, index) => <Button variant="surface" size="compact" className="h-auto max-w-full gap-1.5 px-[7px] py-[5px] normal-case text-[#d7d9e0]" key={tag} onClick={() => setTags(tags.filter((_, i) => i !== index))}><span className="overflow-hidden text-ellipsis">{tag}</span><b className="text-[13px] font-normal leading-none text-[#777b88]">×</b></Button>)}
              <input className="min-w-[90px] flex-1 border-0 bg-transparent px-[3px] py-1.5 font-mono text-[11px] text-white outline-none" aria-label="Add search tag" placeholder="Add a tag…" value={tagInput} onChange={(e) => void requestSuggestions(e.target.value)} />
              {suggestions.length > 0 && <div className="absolute -left-px -right-px top-[calc(100%+8px)] z-40 max-h-[250px] overflow-auto border border-[#3a3d49] bg-[#11131c] shadow-[0_16px_34px_#000b]">{suggestions.map((item) => <button type="button" className="flex w-full items-center justify-between gap-3 border-0 border-b border-[#242732] bg-transparent px-[11px] py-2.5 text-left font-mono text-[10px] text-[#d9dbe2] last:border-b-0 hover:bg-[#1d202b] hover:text-[var(--acid)] focus:bg-[#1d202b] focus:text-[var(--acid)] focus:outline-none" key={item.name} onClick={() => addTag(item.name)}><span>{item.name}</span><small className="font-mono text-[8px] text-[#717582]">{item.post_count?.toLocaleString()}</small></button>)}</div>}
            </div>
            <button className="w-11 shrink-0 border-0 border-l border-[var(--line)] bg-transparent text-[var(--acid)]" type="submit">↗</button>
          </form>
          <div className="mt-[15px] grid max-h-[440px] grid-cols-3 gap-[7px] overflow-auto pr-[3px] max-[700px]:max-h-[360px] max-[700px]:grid-cols-4">{loadingPosts && !posts.length ? <div className="col-span-full px-2.5 py-[60px] text-center font-mono text-[11px] leading-[1.8] text-[var(--muted)]">Loading artwork…</div> : posts.map((post) => <button className={cn('relative aspect-[.76] overflow-hidden border border-transparent bg-[#171821] p-0', selectedId === post.id && 'border-[var(--acid)]')} key={post.id} onClick={() => selectPost(post)}>{postPreview(post) ? <img className="size-full object-cover saturate-[.8] transition hover:scale-105 hover:saturate-[1.1]" src={proxied(postPreview(post))} loading="lazy" alt={friendlyName(post)} /> : <div className="grid size-full place-items-center bg-[repeating-linear-gradient(135deg,#171821_0_8px,#12131b_8px_16px)] p-2 text-center font-mono text-[7px] text-[#666a77]">NO IMAGE</div>}<span className="absolute bottom-1 left-1 bg-[#090a10cc] p-[3px] font-mono text-[7px] text-[#c7c9d0]">{post.image_height > post.image_width * 1.15 ? 'PORTRAIT' : 'ART'}</span></button>)}</div>
          <Button className="my-3.5 w-full" disabled={loadingPosts} onClick={() => void loadPosts(true, page + 1, tags.join(' '))}>Load more</Button>
          <small className="block text-[9px] leading-[1.5] text-[#60626d]">Artwork is served by Danbooru and belongs to its respective artists.</small>
        </aside>

        <section className="relative flex flex-col items-center justify-center overflow-hidden bg-[linear-gradient(#14162080_1px,transparent_1px),linear-gradient(90deg,#14162080_1px,transparent_1px)] bg-[size:36px_36px] [perspective:1000px] max-[1000px]:min-h-[650px] max-[700px]:order-first max-[700px]:min-h-[580px]" aria-label="Card preview">
          <CardRenderer className="w-[min(355px,70%)] max-[700px]:w-[300px]" card={card} resolveArtworkUrl={proxied} interactive={hasArtwork} subjectRefreshKey={subjectRefreshKey} onArtworkPlacementChange={hasArtwork ? ({ x, y }) => patchArtwork({ x, y }) : undefined} onArtworkLoad={handleArtworkLoad} onStatusChange={handleRendererStatus} />
          {busy && <div className="absolute inset-0 z-50 grid place-items-center content-center gap-3 bg-[#0c0d14cc] font-mono text-[10px] uppercase tracking-[.12em] text-[#cfd2da]"><span className="size-[26px] animate-spin rounded-full border-2 border-[#ffffff26] border-r-[var(--acid)]"/><span>{renderStatus === 'separating-subject' ? 'Separating subject…' : renderStatus === 'refining-mask' ? 'Refining mask…' : 'Loading card…'}</span></div>}
          <p className="mt-[22px] font-mono text-[9px] uppercase tracking-[.08em] text-[#666874]">Drag to place · move to shift the light · click to flip</p>
        </section>

        <aside className="min-h-0 border-l border-[var(--line)] bg-[#0d0e15] p-[26px] max-[1000px]:col-span-full max-[1000px]:border-l-0 max-[1000px]:border-t max-[1000px]:border-[var(--line)] min-[1001px]:overflow-y-auto">
          <SectionHeader step="02" title="Compose" />
          <fieldset className={fieldsetClass}>
            <legend className={cn(monoLabel, 'mb-2.5')}>Holo style</legend>
            <Tabs value={activeHoloLayer} onValueChange={(value) => setActiveHoloLayer(value as HoloLayer)}>
              <TabsList className={cn(holoTabsClass, 'mb-2.5')}><TabsTrigger value="background">Background</TabsTrigger>{subject.separated && <TabsTrigger value="subject">Subject</TabsTrigger>}{card.layout === 'standard' && <TabsTrigger value="frame">Frame</TabsTrigger>}</TabsList>
            </Tabs>
            <div className="grid max-h-[330px] grid-cols-2 gap-1.5 overflow-auto pr-[3px]">
              {(activeHoloLayer === 'subject' || activeHoloLayer === 'frame') && <Button variant="surface" size="compact" className={cn('relative min-h-[42px] justify-start overflow-hidden text-left', activeFoil === 'none' && 'border-[var(--acid)] bg-[#191b24] text-[#f1f2f5]')} onClick={() => chooseFoil('none')}>None</Button>}
              {FOILS.map(([id, label]) => <Button variant="surface" size="compact" key={id} className={cn('group relative isolate min-h-[42px] justify-start overflow-hidden text-left', activeFoil === id && 'border-[var(--acid)] bg-[#191b24] text-[#f1f2f5]')} onClick={() => chooseFoil(id)}><HoloEffectPreview foil={id}/><span className="pointer-events-none relative z-[2] [text-shadow:0_1px_4px_#000]">{label}</span></Button>)}
            </div>
          </fieldset>

          <Collapsible open={maskOpen} onOpenChange={setMaskOpen} className="-mt-3.5 mb-7">
            <div className="grid grid-cols-[minmax(0,1fr)_42px]">
              <Button variant="primary" className="rounded-none border-r-[#10110d33]" disabled={disabled} onClick={separateSubject}><span>✦</span>{subject.separated ? 'Separate again' : 'Separate subject'}</Button>
              <CollapsibleTrigger asChild><Button variant="primary" size="icon" className="rounded-none border-l-[#10110d33] px-0" disabled={disabled} aria-label="Toggle mask refinement settings"><ChevronDown className={cn('size-4 transition-transform duration-150', maskOpen && 'rotate-180')} /></Button></CollapsibleTrigger>
            </div>
            <CollapsibleContent className="border border-t-0 border-[#30333e] bg-[#11131b] px-3.5 pb-3 pt-3.5">
              <div className="mb-2.5 flex items-baseline justify-between gap-3"><span className="font-mono text-[9px] uppercase tracking-[.06em] text-[#d8dbe2]">Mask refinement</span><small className="text-right font-mono text-[8px] text-[#696d78]">Applied on the next separation</small></div>
              <MaskControl label="Threshold" value={pendingMask.threshold} min={0} max={255} warnLow onChange={(value) => patchPendingMask({ threshold: value })}/>
              <MaskControl label="Feather" value={pendingMask.feather} min={0} max={127} onChange={(value) => patchPendingMask({ feather: value })}/>
              <MaskControl label="Expand" value={pendingMask.expand} min={-8} max={8} onChange={(value) => patchPendingMask({ expand: value })}/>
              <Button className="w-full" onClick={resetPendingMask}>Reset mask settings</Button>
            </CollapsibleContent>
          </Collapsible>

          <fieldset className={fieldsetClass}>
            <legend className={cn(monoLabel, 'mb-2.5')}>Card layout</legend>
            <div className="grid grid-cols-2 bg-[#090a10] p-[3px]">
              <Button variant="ghost" className={cn('border-0', card.layout === 'full-art' && 'bg-[#20222c] text-white')} onClick={() => setLayout('full-art')}>Full Art</Button>
              <Button variant="ghost" className={cn('border-0', card.layout === 'standard' && 'bg-[#20222c] text-white')} onClick={() => setLayout('standard')}>Standard</Button>
            </div>
          </fieldset>

          <fieldset className={fieldsetClass}>
            <legend className={cn(monoLabel, 'mb-2.5')}>Card details</legend>
            <label className="mb-3 block"><span className={cn(monoLabel, 'mb-2 block')}>Name</span><input className={textFieldClass} value={card.content.name} maxLength={48} onChange={(event) => patchContent({ name: event.target.value })}/></label>
            {card.layout === 'standard' && <>
              <div className="mb-3 grid grid-cols-2 gap-2.5">
                <label className="block"><span className={cn(monoLabel, 'mb-2 block')}>Attack</span><input type="number" className={cn(textFieldClass, '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')} min={0} max={9999} step={1} value={card.content.attack} onChange={(event) => patchContent({ attack: Math.round(clamp(Number(event.target.value) || 0, 0, 9999)) })}/></label>
                <label className="block"><span className={cn(monoLabel, 'mb-2 block')}>Defense</span><input type="number" className={cn(textFieldClass, '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')} min={0} max={9999} step={1} value={card.content.defense} onChange={(event) => patchContent({ defense: Math.round(clamp(Number(event.target.value) || 0, 0, 9999)) })}/></label>
              </div>
              <label className="block"><span className={cn(monoLabel, 'mb-2 block')}>Description</span><textarea className={cn(textFieldClass, 'min-h-[92px] resize-y leading-[1.5]')} value={card.content.description} maxLength={280} placeholder="Describe the card…" onChange={(event) => patchContent({ description: event.target.value })}/></label>
            </>}
          </fieldset>

          <fieldset className={fieldsetClass}><legend className={cn(monoLabel, 'mb-2.5')}>Card back</legend><div className="grid grid-cols-2 gap-1.5">{BACKS.map((back) => <Button variant="surface" size="compact" key={back} className={cn('justify-start capitalize', card.appearance.back === back && 'border-[var(--acid)] bg-[#191b24] text-[#f1f2f5]')} onClick={() => patchAppearance({ back })}>{back}</Button>)}</div></fieldset>

          <div className="my-6"><div className="mb-2.5 flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[.06em] text-[#9a9ca6]"><span>Artwork scale</span><EditableNumber label="Artwork scale" value={Math.round(card.artwork.scale * 100)} min={50} max={220} onChange={(value) => patchArtwork({ scale: value / 100 })}/></div><Slider min={50} max={220} value={[card.artwork.scale * 100]} onValueChange={([value]) => patchArtwork({ scale: value / 100 })}/></div>
          <div className="my-6"><div className="mb-2.5 flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[.06em] text-[#9a9ca6]"><span>Horizontal</span><EditableNumber label="Horizontal" value={Math.round(card.artwork.x)} min={0} max={100} onChange={(value) => patchArtwork({ x: value })}/></div><Slider min={0} max={100} value={[card.artwork.x]} onValueChange={([value]) => patchArtwork({ x: value })}/></div>
          <div className="my-6"><div className="mb-2.5 flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[.06em] text-[#9a9ca6]"><span>Vertical</span><EditableNumber label="Vertical" value={Math.round(card.artwork.y)} min={0} max={100} onChange={(value) => patchArtwork({ y: value })}/></div><Slider min={0} max={100} value={[card.artwork.y]} onValueChange={([value]) => patchArtwork({ y: value })}/></div>

          {renderError && <p className="min-h-[34px] text-[10px] leading-[1.55] text-[#696b76]">{renderError}</p>}
          <Button className="my-3.5 w-full" onClick={() => patchArtwork({ x: 50, y: 48, scale: 1 })}>Reset placement</Button>
        </aside>
      </div>
    </main>
  </>;
}

createRoot(document.getElementById('app')!).render(<Studio />);
