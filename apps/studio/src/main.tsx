import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CardRenderer, type CardRendererStatus } from '@holo/card-renderer';
import type { CardDefinition } from '@holo/card-schema';
import './style.css';

const FOILS = [
  ['classic', 'Holo'], ['galaxy', 'Galaxy'], ['holo-v', 'Holo V'], ['prism', 'VMAX'], ['vstar', 'VSTAR'],
  ['ultra', 'Full / Alt Art'], ['trainer', 'Trainer Full Art'], ['fullart', 'Rainbow'], ['rainbow-alt', 'Rainbow Alt'],
  ['gold', 'Gold / Secret'], ['radiant', 'Radiant'], ['gallery', 'Trainer Gallery'], ['gallery-v', 'Gallery V'], ['gallery-vmax', 'Gallery VMAX'],
] as const;
const BACKS = ['aurora', 'cosmic', 'gold', 'minimal'] as const;

type Post = {
  id: number;
  tag_string_character?: string;
  image_width: number;
  image_height: number;
  preview_file_url?: string;
  large_file_url?: string;
  file_url?: string;
};
type TagSuggestion = { name: string; post_count?: number | null };

function proxied(url: string) { return url ? `/api/image?url=${encodeURIComponent(url)}` : ''; }
function postImage(post: Post) { return post.large_file_url || post.file_url || post.preview_file_url || ''; }
function postPreview(post: Post) { return post.preview_file_url || post.large_file_url || post.file_url || ''; }
function friendlyName(post: Post) {
  const tag = post.tag_string_character?.split(' ')[0] || 'untitled character';
  return tag.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultCard(): CardDefinition {
  return {
    version: 1,
    artwork: { url: '', name: 'SELECT AN ARTWORK', x: 50, y: 48, scale: 1, mode: 'full', subject: { separated: false, mask: { threshold: 128, feather: 24, expand: 0 } } },
    appearance: { backgroundFoil: 'classic', subjectFoil: 'none', back: 'aurora' },
  };
}

function cardFromQuery(): CardDefinition {
  const card = defaultCard();
  const q = new URLSearchParams(location.search);
  const image = q.get('img');
  if (!image) return card;
  card.artwork.url = image;
  card.artwork.name = q.get('name') || 'Shared artwork';
  card.artwork.x = Number(q.get('x') ?? 50);
  card.artwork.y = Number(q.get('y') ?? 48);
  card.artwork.scale = Number(q.get('scale') ?? 1);
  card.artwork.mode = q.get('mode') === 'frame' ? 'frame' : 'full';
  card.artwork.subject = {
    separated: q.get('separated') === '1',
    mask: {
      threshold: Number(q.get('maskThreshold') ?? 128),
      feather: Number(q.get('maskFeather') ?? 24),
      expand: Number(q.get('maskExpand') ?? 0),
    },
  };
  card.appearance.backgroundFoil = q.get('foil') || 'classic';
  card.appearance.subjectFoil = q.get('subjectFoil') || 'none';
  card.appearance.back = q.get('back') || 'aurora';
  return card;
}

function syncQuery(card: CardDefinition) {
  if (!card.artwork.url) return history.replaceState(null, '', location.pathname);
  const q = new URLSearchParams();
  q.set('img', card.artwork.url);
  if (card.artwork.name) q.set('name', card.artwork.name);
  q.set('foil', card.appearance.backgroundFoil);
  q.set('back', card.appearance.back);
  q.set('mode', card.artwork.mode);
  q.set('x', String(card.artwork.x));
  q.set('y', String(card.artwork.y));
  q.set('scale', String(card.artwork.scale));
  if (card.artwork.subject?.separated) {
    q.set('separated', '1');
    q.set('maskThreshold', String(card.artwork.subject.mask.threshold));
    q.set('maskFeather', String(card.artwork.subject.mask.feather));
    q.set('maskExpand', String(card.artwork.subject.mask.expand));
    q.set('subjectFoil', card.appearance.subjectFoil);
  }
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
  const suggestionTimer = useRef<number | undefined>(undefined);
  const hasArtwork = Boolean(card.artwork.url);

  useEffect(() => { syncQuery(card); }, [card]);
  useEffect(() => { void loadPosts(false, 1); }, []);

  const currentQuery = useMemo(() => tags.join(' ').trim(), [tags]);

  async function loadPosts(append: boolean, requestedPage = page) {
    setLoadingPosts(true);
    try {
      const response = await fetch(`/api/posts?q=${encodeURIComponent(currentQuery)}&page=${requestedPage}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'The imageboard could not be reached.');
      setPosts((previous) => append ? [...previous, ...payload] : payload);
      setPage(requestedPage);
    } finally { setLoadingPosts(false); }
  }

  function selectPost(post: Post) {
    setSelectedId(post.id);
    setCard((current) => ({
      ...current,
      artwork: { ...current.artwork, url: postImage(post), name: friendlyName(post), subject: { separated: false, mask: { threshold: 128, feather: 24, expand: 0 } } },
      appearance: { ...current.appearance, subjectFoil: 'none' },
    }));
  }

  function patchArtwork(patch: Partial<CardDefinition['artwork']>) {
    setCard((current) => ({ ...current, artwork: { ...current.artwork, ...patch } }));
  }
  function patchAppearance(patch: Partial<CardDefinition['appearance']>) {
    setCard((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));
  }
  function patchMask(patch: Partial<NonNullable<CardDefinition['artwork']['subject']>['mask']>) {
    setCard((current) => ({ ...current, artwork: { ...current.artwork, subject: { separated: current.artwork.subject?.separated ?? false, mask: { threshold: 128, feather: 24, expand: 0, ...current.artwork.subject?.mask, ...patch } } } }));
  }

  function addTag(value: string) {
    const tag = value.trim().replace(/\s+/g, '_');
    if (!tag || tags.includes(tag)) return;
    setTags((current) => [...current, tag]); setTagInput(''); setSuggestions([]);
  }
  async function requestSuggestions(value: string) {
    setTagInput(value);
    window.clearTimeout(suggestionTimer.current);
    if (!value.trim()) return setSuggestions([]);
    suggestionTimer.current = window.setTimeout(async () => {
      const response = await fetch(`/api/tags?q=${encodeURIComponent(value.trim())}`);
      if (response.ok) setSuggestions((await response.json()).filter((item: TagSuggestion) => !tags.includes(item.name)));
    }, 180);
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (tagInput.trim()) addTag(tagInput);
    void loadPosts(false, 1);
  }

  const subject = card.artwork.subject ?? { separated: false, mask: { threshold: 128, feather: 24, expand: 0 } };
  const busy = ['loading-artwork', 'separating-subject', 'refining-mask'].includes(renderStatus);

  return <>
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">H</span><span>HOLO / STUDIO</span></a><div className="status"><i /> Browser processing · images stay local</div></header>
    <main>
      <section className="intro"><p className="eyebrow">Holographic card composer</p><h1>Turn character art into<br/><em>a collectible moment.</em></h1><p>Browse anime artwork, separate its subject locally, and apply interactive holographic finishes.</p></section>
      <div className="workspace">
        <aside className="panel library">
          <div className="panel-head"><div><span className="step">01</span><h2>Find artwork</h2></div><span className="source">DANBOORU</span></div>
          <form className="search" autoComplete="off" onSubmit={submitSearch}><div className="tag-editor"><div className="tag-chips">{tags.map((tag, index) => <button type="button" className="tag-chip" key={tag} onClick={() => setTags(tags.filter((_, i) => i !== index))}><span>{tag}</span><b>×</b></button>)}</div><input aria-label="Add search tag" placeholder="Add a tag…" value={tagInput} onChange={(e) => void requestSuggestions(e.target.value)} />{suggestions.length > 0 && <div className="tag-suggestions">{suggestions.map((item) => <button type="button" className="tag-suggestion" key={item.name} onClick={() => addTag(item.name)}><span>{item.name}</span><small>{item.post_count?.toLocaleString()}</small></button>)}</div>}</div><button type="submit">↗</button></form>
          <div className="gallery">{loadingPosts && !posts.length ? <div className="loading">Loading artwork…</div> : posts.map((post) => <button className={`thumb ${selectedId === post.id ? 'selected' : ''}`} key={post.id} onClick={() => selectPost(post)}>{postPreview(post) ? <img src={proxied(postPreview(post))} loading="lazy" alt={friendlyName(post)} /> : <div className="thumb-missing">NO IMAGE</div>}<span>{post.image_height > post.image_width * 1.15 ? 'PORTRAIT' : 'ART'}</span></button>)}</div>
          <button className="more" disabled={loadingPosts} onClick={() => void loadPosts(true, page + 1)}>Load more</button><small>Artwork is served by Danbooru and belongs to its respective artists.</small>
        </aside>

        <section className="stage" aria-label="Card preview">
          {hasArtwork ? <CardRenderer className="studio-card-preview" card={card} resolveArtworkUrl={proxied} onStatusChange={(status, error) => { setRenderStatus(status); setRenderError(error?.message || ''); }} /> : <CardRenderer className="studio-card-preview" card={card} interactive={false} />}
          {busy && <div className="shared-card-loader"><span className="spinner"/><span>{renderStatus === 'separating-subject' ? 'Separating subject…' : renderStatus === 'refining-mask' ? 'Refining mask…' : 'Loading card…'}</span></div>}
          <p className="hint">Move to shift the light · click to flip</p>
        </section>

        <aside className="panel controls">
          <div className="panel-head"><div><span className="step">02</span><h2>Compose</h2></div></div>
          <fieldset><legend>Background holo</legend><div className="foil-picker">{FOILS.map(([id, label]) => <button type="button" key={id} className={`foil-option ${card.appearance.backgroundFoil === id ? 'active' : ''}`} onClick={() => patchAppearance({ backgroundFoil: id })}><span>{label}</span></button>)}</div></fieldset>
          <fieldset><legend>Subject holo</legend><div className="foil-picker"><button type="button" className={`foil-option ${card.appearance.subjectFoil === 'none' ? 'active' : ''}`} onClick={() => patchAppearance({ subjectFoil: 'none' })}>None</button>{FOILS.map(([id, label]) => <button type="button" key={id} className={`foil-option ${card.appearance.subjectFoil === id ? 'active' : ''}`} disabled={!subject.separated} onClick={() => patchAppearance({ subjectFoil: id })}>{label}</button>)}</div></fieldset>
          <fieldset><legend>Card back</legend><div className="back-picker">{BACKS.map((back) => <button type="button" key={back} className={`back-option ${card.appearance.back === back ? 'active' : ''}`} onClick={() => patchAppearance({ back })}><span>{back}</span></button>)}</div></fieldset>
          <fieldset><legend>Art treatment</legend><div className="segmented"><button className={card.artwork.mode === 'full' ? 'active' : ''} onClick={() => patchArtwork({ mode: 'full' })}>Full body</button><button className={card.artwork.mode === 'frame' ? 'active' : ''} onClick={() => patchArtwork({ mode: 'frame' })}>In frame</button></div></fieldset>
          <div className="control"><label>Artwork scale <output>{Math.round(card.artwork.scale * 100)}%</output></label><input type="range" min="50" max="220" value={card.artwork.scale * 100} onChange={(e) => patchArtwork({ scale: Number(e.target.value) / 100 })}/></div>
          <div className="control"><label>Horizontal <output>{card.artwork.x}%</output></label><input type="range" min="0" max="100" value={card.artwork.x} onChange={(e) => patchArtwork({ x: Number(e.target.value) })}/></div>
          <div className="control"><label>Vertical <output>{card.artwork.y}%</output></label><input type="range" min="0" max="100" value={card.artwork.y} onChange={(e) => patchArtwork({ y: Number(e.target.value) })}/></div>
          <button className="primary" disabled={!hasArtwork || busy} onClick={() => setCard((current) => ({ ...current, artwork: { ...current.artwork, subject: { separated: true, mask: current.artwork.subject?.mask ?? { threshold: 128, feather: 24, expand: 0 } } } }))}><span>✦</span> {subject.separated ? 'Separate again' : 'Separate subject'}</button>
          {subject.separated && <fieldset className="advanced-mask"><legend>Mask refinement</legend><div className="mask-control"><label>Threshold <output>{subject.mask.threshold}</output></label><input type="range" min="0" max="255" value={subject.mask.threshold} onChange={(e) => patchMask({ threshold: Number(e.target.value) })}/></div><div className="mask-control"><label>Feather <output>{subject.mask.feather}</output></label><input type="range" min="0" max="127" value={subject.mask.feather} onChange={(e) => patchMask({ feather: Number(e.target.value) })}/></div><div className="mask-control"><label>Expand <output>{subject.mask.expand}</output></label><input type="range" min="-8" max="8" value={subject.mask.expand} onChange={(e) => patchMask({ expand: Number(e.target.value) })}/></div></fieldset>}
          {renderError && <p className="process-note">{renderError}</p>}
          <button className="secondary" onClick={() => patchArtwork({ x: 50, y: 48, scale: 1 })}>Reset placement</button>
        </aside>
      </div>
    </main>
  </>;
}

createRoot(document.getElementById('app')!).render(<Studio />);
