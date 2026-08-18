const state = {
  posts: [], selected: null, page: 1, x: 50, y: 48, scale: 1, mode: 'full', foil: 'classic', back: 'aurora', flipped: false,
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
      <p>Browse anime artwork, separate its subject locally, and apply interactive holographic finishes.</p>
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
        <p class="tag-help">Type a Danbooru tag, choose a suggestion, then search. Rating defaults to general unless you add a rating tag.</p>
        <div id="gallery" class="gallery"><div class="loading">Loading artwork…</div></div>
        <button id="more" class="more">Load more</button>
        <small>Artwork is served by Danbooru and belongs to its respective artists.</small>
      </aside>

      <section class="stage" aria-label="Card preview">
        <div id="card-shell" class="card-shell" tabindex="0" role="button" aria-label="Flip card" aria-pressed="false">
          <div id="card-rotator" class="card-rotator">
            <div id="card" class="card card-face card-front" data-foil="classic">
              <div class="card-backdrop"></div><div class="card-rays"></div>
              <img id="art-bg" class="art-layer art-background" alt="Selected artwork background">
              <div class="card-foil"></div>
              <img id="art-subject" class="art-layer art-subject" alt="Separated foreground subject" hidden>
              <div class="card-glare"></div>
              <div class="card-copy"><span class="serial">HS–001</span><div><span class="rarity">PRISMATIC</span><h3 id="card-name">SELECT AN ARTWORK</h3></div></div>
            </div>
            <div id="card-back" class="card-face card-back" aria-hidden="true">
              <img id="card-back-image" src="/assets/card-backs/aurora.svg" alt="Aurora card back">
            </div>
          </div>
        </div>
        <p class="hint">Move to shift the light · click to flip</p>
      </section>

      <aside class="panel controls">
        <div class="panel-head"><div><span class="step">02</span><h2>Compose</h2></div></div>
        <fieldset><legend>Holo style</legend>
          <div class="foil-picker">
            <button type="button" class="foil-option active" data-foil="classic">Classic</button>
            <button type="button" class="foil-option" data-foil="galaxy">Galaxy</button>
            <button type="button" class="foil-option" data-foil="prism">VMAX</button>
            <button type="button" class="foil-option" data-foil="fullart">Rainbow</button>
            <button type="button" class="foil-option" data-foil="gold">Gold</button>
          </div>
        </fieldset>
        <fieldset><legend>Card back</legend>
          <div class="back-picker">
            <button type="button" class="back-option active" data-back="aurora"><img src="/assets/card-backs/aurora.svg" alt=""><span>Aurora</span></button>
            <button type="button" class="back-option" data-back="cosmic"><img src="/assets/card-backs/cosmic.svg" alt=""><span>Cosmic</span></button>
            <button type="button" class="back-option" data-back="gold"><img src="/assets/card-backs/gold.svg" alt=""><span>Gold</span></button>
            <button type="button" class="back-option" data-back="minimal"><img src="/assets/card-backs/minimal.svg" alt=""><span>Minimal</span></button>
          </div>
        </fieldset>
        <fieldset><legend>Art treatment</legend><div class="segmented"><button class="active" data-mode="full">Full body</button><button data-mode="frame">In frame</button></div></fieldset>
        <div class="control"><label for="scale">Artwork scale <output id="scale-out">100%</output></label><input id="scale" type="range" min="50" max="220" value="100"></div>
        <div class="control"><label for="x">Horizontal <output id="x-out">50%</output></label><input id="x" type="range" min="0" max="100" value="50"></div>
        <div class="control"><label for="y">Vertical <output id="y-out">48%</output></label><input id="y" type="range" min="0" max="100" value="48"></div>
        <button id="separate-subject" class="primary" disabled><span>✦</span> Separate subject</button>
        <p id="process-note" class="process-note"></p>
        <button id="reset" class="secondary">Reset placement</button>
      </aside>
    </div>
  </main>`;

const $ = (selector) => document.querySelector(selector);
const gallery = $('#gallery');
const card = $('#card');
const cardShell = $('#card-shell');
const cardBackImage = $('#card-back-image');
const artBg = $('#art-bg');
const artSubject = $('#art-subject');
const tagInput = $('#tag-input');
const tagSuggestions = $('#tag-suggestions');
const separateButton = $('#separate-subject');

let workerSequence = 0;
const pendingWorkerJobs = new Map();
const backgroundWorker = new Worker('/src/background-worker.js', { type: 'module' });

backgroundWorker.addEventListener('message', (event) => {
  const { type, id, buffer, contentType, message } = event.data || {};
  const job = pendingWorkerJobs.get(id);
  if (!job) return;
  if (type === 'progress') return;
  pendingWorkerJobs.delete(id);
  if (type === 'done') job.resolve(new Blob([buffer], { type: contentType || 'image/png' }));
  else job.reject(new Error(message || 'Subject separation failed'));
});
backgroundWorker.addEventListener('error', (event) => {
  for (const job of pendingWorkerJobs.values()) job.reject(new Error(event.message || 'Background worker failed'));
  pendingWorkerJobs.clear();
});
function separateInWorker(buffer, contentType) {
  const id = ++workerSequence;
  return new Promise((resolve, reject) => {
    pendingWorkerJobs.set(id, { resolve, reject });
    backgroundWorker.postMessage({ id, buffer, contentType }, [buffer]);
  });
}

function proxied(url) { return url ? `/api/image?url=${encodeURIComponent(url)}` : ''; }
function friendlyName(post) {
  const tag = post.tag_string_character?.split(' ')[0] || 'untitled character';
  return tag.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function postPreview(post) { return post.preview_file_url || post.large_file_url || post.file_url || ''; }
function postImage(post) { return post.large_file_url || post.file_url || post.preview_file_url || ''; }
function currentQuery() { return state.tags.join(' ').trim(); }

function renderTags() {
  $('#tag-chips').innerHTML = state.tags.map((tag, index) => `<button type="button" class="tag-chip" data-remove-tag="${index}" title="Remove ${tag}"><span>${tag}</span><b aria-hidden="true">×</b></button>`).join('');
}
function addTag(rawTag) {
  const tag = String(rawTag || '').trim().replace(/\s+/g, '_');
  if (!tag || state.tags.includes(tag)) return;
  state.tags.push(tag); renderTags(); tagInput.value = ''; hideSuggestions(); tagInput.focus();
}
function removeTag(index) { state.tags.splice(index, 1); renderTags(); tagInput.focus(); }
function hideSuggestions() { state.suggestions = []; tagSuggestions.hidden = true; tagSuggestions.innerHTML = ''; }
function renderTagSuggestions() {
  if (!state.suggestions.length) return hideSuggestions();
  tagSuggestions.innerHTML = state.suggestions.map((item, index) => `<button type="button" class="tag-suggestion" data-suggestion="${index}"><span>${item.name}</span>${item.post_count != null ? `<small>${Number(item.post_count).toLocaleString()}</small>` : ''}</button>`).join('');
  tagSuggestions.hidden = false;
}
async function loadTagSuggestions(value) {
  const query = value.trim(); if (!query) return hideSuggestions();
  try {
    const response = await fetch(`/api/tags?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error();
    state.suggestions = (await response.json()).filter((item) => !state.tags.includes(item.name)); renderTagSuggestions();
  } catch { hideSuggestions(); }
}

function renderPosts() {
  gallery.innerHTML = state.posts.map((post, index) => {
    const preview = postPreview(post);
    return `<button class="thumb ${state.selected?.id === post.id ? 'selected' : ''}" data-index="${index}" aria-label="Use ${friendlyName(post)}">${preview ? `<img src="${proxied(preview)}" loading="lazy" alt="${friendlyName(post)}">` : '<div class="thumb-missing">NO IMAGE</div>'}<span>${post.image_height > post.image_width * 1.15 ? 'PORTRAIT' : 'ART'}</span></button>`;
  }).join('') || '<div class="empty">No results. Try fewer tags.</div>';
  gallery.querySelectorAll('.thumb').forEach((button) => button.addEventListener('click', () => selectPost(state.posts[Number(button.dataset.index)])));
  gallery.querySelectorAll('.thumb img').forEach((image) => image.addEventListener('error', () => image.replaceWith(Object.assign(document.createElement('div'), { className: 'thumb-missing', textContent: 'IMAGE FAILED' })), { once: true }));
}
async function loadPosts(append = false) {
  if (!append) { state.page = 1; gallery.innerHTML = '<div class="loading">Searching the board…</div>'; }
  $('#more').disabled = true;
  try {
    const response = await fetch(`/api/posts?q=${encodeURIComponent(currentQuery())}&page=${state.page}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'The imageboard could not be reached.');
    state.posts = append ? [...state.posts, ...payload] : payload; renderPosts();
  } catch (error) { gallery.innerHTML = `<div class="empty">${error.message}<br>Try again shortly.</div>`; }
  $('#more').disabled = false;
}

function setFlipped(flipped) {
  state.flipped = flipped;
  cardShell.classList.toggle('flipped', flipped);
  cardShell.setAttribute('aria-pressed', String(flipped));
}
function clearSubject() {
  if (state.cutoutUrl) URL.revokeObjectURL(state.cutoutUrl);
  state.cutoutUrl = '';
  artSubject.hidden = true;
  artSubject.removeAttribute('src');
  card.classList.remove('has-subject');
}
function selectPost(post) {
  clearSubject(); state.selected = post; setFlipped(false);
  artBg.src = proxied(postImage(post)); artBg.alt = friendlyName(post);
  $('#card-name').textContent = friendlyName(post);
  separateButton.disabled = false;
  separateButton.innerHTML = '<span>✦</span> Separate subject';
  $('#process-note').textContent = '';
  renderPosts(); applyPlacement();
}
function applyPlacement() {
  card.style.setProperty('--art-x', `${state.x}%`); card.style.setProperty('--art-y', `${state.y}%`); card.style.setProperty('--art-scale', state.scale);
  card.classList.toggle('in-frame', state.mode === 'frame'); card.dataset.foil = state.foil;
  cardBackImage.src = `/assets/card-backs/${state.back}.svg`;
  cardBackImage.alt = `${state.back} card back`;
  $('#scale-out').value = `${Math.round(state.scale * 100)}%`; $('#x-out').value = `${state.x}%`; $('#y-out').value = `${state.y}%`;
}

renderTags();
$('#tag-chips').addEventListener('click', (event) => { const button = event.target.closest('[data-remove-tag]'); if (button) removeTag(Number(button.dataset.removeTag)); });
tagInput.addEventListener('input', () => { clearTimeout(state.suggestionTimer); state.suggestionTimer = setTimeout(() => loadTagSuggestions(tagInput.value), 180); });
tagInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') return hideSuggestions();
  if (event.key === 'Backspace' && !tagInput.value && state.tags.length) return removeTag(state.tags.length - 1);
  if (event.key === 'Enter' && tagInput.value.trim()) { event.preventDefault(); addTag(state.suggestions[0]?.name || tagInput.value); }
});
tagSuggestions.addEventListener('click', (event) => { const button = event.target.closest('[data-suggestion]'); if (button) addTag(state.suggestions[Number(button.dataset.suggestion)]?.name); });
document.addEventListener('click', (event) => { if (!event.target.closest('.tag-editor')) hideSuggestions(); });
$('.search').addEventListener('submit', (event) => { event.preventDefault(); if (tagInput.value.trim()) addTag(tagInput.value); loadPosts(); });
$('#more').addEventListener('click', () => { state.page += 1; loadPosts(true); });
$('.foil-picker').addEventListener('click', (event) => {
  const button = event.target.closest('[data-foil]'); if (!button) return;
  state.foil = button.dataset.foil; document.querySelectorAll('.foil-option').forEach((item) => item.classList.toggle('active', item === button)); applyPlacement();
});
$('.back-picker').addEventListener('click', (event) => {
  const button = event.target.closest('[data-back]'); if (!button) return;
  state.back = button.dataset.back; document.querySelectorAll('.back-option').forEach((item) => item.classList.toggle('active', item === button)); applyPlacement();
});
$('.segmented').addEventListener('click', (event) => { if (!event.target.dataset.mode) return; state.mode = event.target.dataset.mode; document.querySelectorAll('.segmented button').forEach((button) => button.classList.toggle('active', button === event.target)); applyPlacement(); });
['scale', 'x', 'y'].forEach((id) => $(`#${id}`).addEventListener('input', (event) => { state[id] = id === 'scale' ? Number(event.target.value) / 100 : Number(event.target.value); applyPlacement(); }));
$('#reset').addEventListener('click', () => { Object.assign(state, { x: 50, y: 48, scale: 1 }); $('#scale').value = 100; $('#x').value = 50; $('#y').value = 48; applyPlacement(); });

separateButton.addEventListener('click', async () => {
  if (!state.selected || state.processing) return;
  const selectedId = state.selected.id;
  state.processing = true; separateButton.disabled = true; separateButton.innerHTML = '<span class="spinner"></span> Separating…'; $('#process-note').textContent = '';
  try {
    const imageResponse = await fetch(proxied(postImage(state.selected)), { credentials: 'same-origin' });
    if (!imageResponse.ok) throw new Error(`Image proxy returned ${imageResponse.status}`);
    const contentType = imageResponse.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`Expected image data but received ${contentType || 'unknown content type'}`);
    const inputBuffer = await imageResponse.arrayBuffer();
    const blob = await separateInWorker(inputBuffer, contentType);
    if (!state.selected || state.selected.id !== selectedId) return;
    clearSubject(); state.cutoutUrl = URL.createObjectURL(blob); artSubject.src = state.cutoutUrl; artSubject.hidden = false; artSubject.alt = `${friendlyName(state.selected)} foreground`; card.classList.add('has-subject');
    separateButton.innerHTML = '<span>✦</span> Separate again';
  } catch (error) {
    $('#process-note').textContent = `Could not separate subject: ${error.message}`;
    separateButton.innerHTML = '<span>✦</span> Try again';
  } finally {
    state.processing = false; separateButton.disabled = !state.selected;
  }
});

function tilt(event) {
  if (state.flipped) return;
  const rect = cardShell.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const cx = x - .5; const cy = y - .5; const hyp = Math.min(1, Math.sqrt(cx * cx + cy * cy) / .7071);
  card.style.setProperty('--mx', `${x * 100}%`); card.style.setProperty('--my', `${y * 100}%`);
  card.style.setProperty('--posx', `${x * 100}%`); card.style.setProperty('--posy', `${y * 100}%`); card.style.setProperty('--hyp', hyp);
  cardShell.style.setProperty('--rx', `${(0.5 - y) * 12}deg`); cardShell.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
}
function resetTilt() { cardShell.style.setProperty('--rx', '0deg'); cardShell.style.setProperty('--ry', '0deg'); }
function toggleFlip() { resetTilt(); setFlipped(!state.flipped); }
cardShell.addEventListener('pointermove', tilt);
cardShell.addEventListener('pointerleave', resetTilt);
cardShell.addEventListener('click', toggleFlip);
cardShell.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleFlip(); } });
applyPlacement(); loadPosts();