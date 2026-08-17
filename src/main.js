const state = {
  posts: [], selected: null, page: 1, x: 50, y: 48, scale: 1, mode: 'full',
  cutoutUrl: '', processing: false, tags: ['hololive', 'solo'], suggestions: [], suggestionTimer: null,
};

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#"><span class="brand-mark">H</span><span>HOLO / STUDIO</span></a>
    <div class="status"><i></i> Browser processing · images stay local</div>
  </header>
  <main>
    <section class="intro">
      <p class="eyebrow">Holographic card composer</p>
      <h1>Turn character art into<br><em>a collectible moment.</em></h1>
      <p>Browse general-rated anime artwork, isolate a subject with IMG.LY, then position it over an interactive foil card.</p>
    </section>
    <div class="workspace">
      <aside class="panel library">
        <div class="panel-head"><div><span class="step">01</span><h2>Find artwork</h2></div><span class="source">DANBOORU</span></div>
        <form class="search" autocomplete="off">
          <div class="tag-editor">
            <div id="tag-chips" class="tag-chips"></div>
            <input id="tag-input" aria-label="Add search tag" placeholder="Add a tag…" spellcheck="false">
            <div id="tag-suggestions" class="tag-suggestions" hidden></div>
          </div>
          <button type="submit" aria-label="Search">↗</button>
        </form>
        <p class="tag-help">Type a Danbooru tag, choose a suggestion, then search. Click × to remove a tag.</p>
        <div id="gallery" class="gallery"><div class="loading">Loading artwork…</div></div>
        <button id="more" class="more">Load more</button>
        <small>Artwork is served by Danbooru and belongs to its respective artists. General-rated results only.</small>
      </aside>

      <section class="stage" aria-label="Card preview">
        <div id="card" class="card" tabindex="0">
          <div class="card-backdrop"></div><div class="card-rays"></div>
          <img id="art" alt="Selected character artwork">
          <div class="card-foil"></div><div class="card-glare"></div>
          <div class="card-copy"><span class="serial">HS–001</span><div><span class="rarity">PRISMATIC</span><h3 id="card-name">SELECT AN ARTWORK</h3></div></div>
        </div>
        <p class="hint">Move your pointer across the card to shift the light</p>
      </section>

      <aside class="panel controls">
        <div class="panel-head"><div><span class="step">02</span><h2>Compose</h2></div></div>
        <fieldset><legend>Art treatment</legend><div class="segmented"><button class="active" data-mode="full">Full body</button><button data-mode="frame">In frame</button></div></fieldset>
        <div class="control"><label for="scale">Artwork scale <output id="scale-out">100%</output></label><input id="scale" type="range" min="50" max="220" value="100"></div>
        <div class="control"><label for="x">Horizontal <output id="x-out">50%</output></label><input id="x" type="range" min="0" max="100" value="50"></div>
        <div class="control"><label for="y">Vertical <output id="y-out">48%</output></label><input id="y" type="range" min="0" max="100" value="48"></div>
        <button id="remove-bg" class="primary" disabled><span>✦</span> Remove background</button>
        <p id="process-note" class="process-note">Choose art, then isolate its subject in your browser.</p>
        <button id="reset" class="secondary">Reset placement</button>
      </aside>
    </div>
  </main>`;

const $ = (selector) => document.querySelector(selector);
const gallery = $('#gallery');
const card = $('#card');
const art = $('#art');
const tagInput = $('#tag-input');
const tagSuggestions = $('#tag-suggestions');

function proxied(url) { return url ? `/api/image?url=${encodeURIComponent(url)}` : ''; }
function friendlyName(post) {
  const tag = post.tag_string_character?.split(' ')[0] || 'untitled character';
  return tag.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function postPreview(post) { return post.preview_file_url || post.large_file_url || post.file_url || ''; }
function postImage(post) { return post.large_file_url || post.file_url || post.preview_file_url || ''; }
function currentQuery() { return state.tags.join(' ').trim(); }

function renderTags() {
  $('#tag-chips').innerHTML = state.tags.map((tag, index) => `
    <button type="button" class="tag-chip" data-remove-tag="${index}" title="Remove ${tag}">
      <span>${tag}</span><b aria-hidden="true">×</b>
    </button>`).join('');
}
function addTag(rawTag) {
  const tag = String(rawTag || '').trim().replace(/\s+/g, '_');
  if (!tag || state.tags.includes(tag)) return;
  state.tags.push(tag);
  renderTags();
  tagInput.value = '';
  hideSuggestions();
  tagInput.focus();
}
function removeTag(index) {
  state.tags.splice(index, 1);
  renderTags();
  tagInput.focus();
}
function hideSuggestions() {
  state.suggestions = [];
  tagSuggestions.hidden = true;
  tagSuggestions.innerHTML = '';
}
function renderTagSuggestions() {
  if (!state.suggestions.length) return hideSuggestions();
  tagSuggestions.innerHTML = state.suggestions.map((item, index) => `
    <button type="button" class="tag-suggestion" data-suggestion="${index}">
      <span>${item.name}</span>${item.post_count != null ? `<small>${Number(item.post_count).toLocaleString()}</small>` : ''}
    </button>`).join('');
  tagSuggestions.hidden = false;
}
async function loadTagSuggestions(value) {
  const query = value.trim();
  if (!query) return hideSuggestions();
  try {
    const response = await fetch(`/api/tags?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Autocomplete failed');
    state.suggestions = (await response.json()).filter((item) => !state.tags.includes(item.name));
    renderTagSuggestions();
  } catch {
    hideSuggestions();
  }
}

function renderPosts() {
  const markup = state.posts.map((post, index) => {
    const preview = postPreview(post);
    return `<button class="thumb ${state.selected?.id === post.id ? 'selected' : ''}" data-index="${index}" aria-label="Use ${friendlyName(post)}">
      ${preview ? `<img src="${proxied(preview)}" loading="lazy" alt="${friendlyName(post)}">` : '<div class="thumb-missing">NO IMAGE</div>'}
      <span>${post.image_height > post.image_width * 1.15 ? 'PORTRAIT' : 'ART'}</span>
    </button>`;
  }).join('');
  gallery.innerHTML = markup || '<div class="empty">No results. Try fewer tags.</div>';
  gallery.querySelectorAll('.thumb').forEach((button) => button.addEventListener('click', () => selectPost(state.posts[Number(button.dataset.index)])));
  gallery.querySelectorAll('.thumb img').forEach((image) => image.addEventListener('error', () => {
    image.replaceWith(Object.assign(document.createElement('div'), { className: 'thumb-missing', textContent: 'IMAGE FAILED' }));
  }, { once: true }));
}
async function loadPosts(append = false) {
  const query = currentQuery();
  if (!append) { state.page = 1; gallery.innerHTML = '<div class="loading">Searching the board…</div>'; }
  $('#more').disabled = true;
  try {
    const response = await fetch(`/api/posts?q=${encodeURIComponent(query)}&page=${state.page}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'The imageboard could not be reached.');
    state.posts = append ? [...state.posts, ...payload] : payload;
    renderPosts();
  } catch (error) {
    gallery.innerHTML = `<div class="empty">${error.message}<br>Try again shortly.</div>`;
  }
  $('#more').disabled = false;
}
function selectPost(post) {
  if (state.cutoutUrl) URL.revokeObjectURL(state.cutoutUrl);
  state.selected = post; state.cutoutUrl = '';
  art.src = proxied(postImage(post));
  art.alt = friendlyName(post);
  $('#card-name').textContent = friendlyName(post);
  $('#remove-bg').disabled = false;
  $('#process-note').textContent = 'Ready to isolate the subject with IMG.LY.';
  renderPosts(); applyPlacement();
}
function applyPlacement() {
  card.style.setProperty('--art-x', `${state.x}%`); card.style.setProperty('--art-y', `${state.y}%`); card.style.setProperty('--art-scale', state.scale);
  card.classList.toggle('in-frame', state.mode === 'frame');
  $('#scale-out').value = `${Math.round(state.scale * 100)}%`; $('#x-out').value = `${state.x}%`; $('#y-out').value = `${state.y}%`;
}

renderTags();
$('#tag-chips').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-tag]');
  if (button) removeTag(Number(button.dataset.removeTag));
});
tagInput.addEventListener('input', () => {
  clearTimeout(state.suggestionTimer);
  state.suggestionTimer = setTimeout(() => loadTagSuggestions(tagInput.value), 180);
});
tagInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') return hideSuggestions();
  if (event.key === 'Backspace' && !tagInput.value && state.tags.length) return removeTag(state.tags.length - 1);
  if (event.key === 'Enter' && tagInput.value.trim()) {
    event.preventDefault();
    addTag(state.suggestions[0]?.name || tagInput.value);
  }
});
tagSuggestions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-suggestion]');
  if (!button) return;
  addTag(state.suggestions[Number(button.dataset.suggestion)]?.name);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.tag-editor')) hideSuggestions();
});
$('.search').addEventListener('submit', (event) => {
  event.preventDefault();
  if (tagInput.value.trim()) addTag(tagInput.value);
  loadPosts();
});
$('#more').addEventListener('click', () => { state.page += 1; loadPosts(true); });
$('.segmented').addEventListener('click', (event) => { if (!event.target.dataset.mode) return; state.mode = event.target.dataset.mode; document.querySelectorAll('.segmented button').forEach((button) => button.classList.toggle('active', button === event.target)); applyPlacement(); });
['scale', 'x', 'y'].forEach((id) => $(`#${id}`).addEventListener('input', (event) => { state[id] = id === 'scale' ? Number(event.target.value) / 100 : Number(event.target.value); applyPlacement(); }));
$('#reset').addEventListener('click', () => { Object.assign(state, { x: 50, y: 48, scale: 1 }); $('#scale').value = 100; $('#x').value = 50; $('#y').value = 48; applyPlacement(); });
$('#remove-bg').addEventListener('click', async () => {
  if (!state.selected || state.processing) return;
  state.processing = true; $('#remove-bg').disabled = true; $('#remove-bg').innerHTML = '<span class="spinner"></span> Isolating subject…'; $('#process-note').textContent = 'The first run downloads the AI model. This can take a minute.';
  try {
    const { removeBackground } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
    const blob = await removeBackground(proxied(postImage(state.selected)), { progress: (_key, current, total) => { if (total) $('#process-note').textContent = `Loading background model · ${Math.round(current / total * 100)}%`; } });
    if (state.cutoutUrl) URL.revokeObjectURL(state.cutoutUrl);
    state.cutoutUrl = URL.createObjectURL(blob); art.src = state.cutoutUrl; card.classList.add('isolated');
    $('#process-note').textContent = 'Subject isolated. Fine-tune its scale and placement.';
  } catch (error) { $('#process-note').textContent = `Could not remove background: ${error.message}`; }
  state.processing = false; $('#remove-bg').disabled = false; $('#remove-bg').innerHTML = '<span>✦</span> Remove again';
});

function tilt(event) {
  const rect = card.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  card.style.setProperty('--mx', `${x * 100}%`); card.style.setProperty('--my', `${y * 100}%`); card.style.setProperty('--rx', `${(0.5 - y) * 12}deg`); card.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
}
card.addEventListener('pointermove', tilt); card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
applyPlacement(); loadPosts();
