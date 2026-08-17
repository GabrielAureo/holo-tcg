const state = { posts: [], selected: null, page: 1, x: 50, y: 48, scale: 1, mode: 'full', cutoutUrl: '', processing: false };

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
        <form class="search"><input name="query" value="hololive solo" aria-label="Search tags" placeholder="Search tags…"><button aria-label="Search">↗</button></form>
        <div class="suggestions"><button data-tag="hololive solo">Hololive</button><button data-tag="hatsune_miku solo">Miku</button><button data-tag="original solo">Original</button></div>
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

function proxied(url) { return `/api/image?url=${encodeURIComponent(url)}`; }
function friendlyName(post) {
  const tag = post.tag_string_character?.split(' ')[0] || 'untitled character';
  return tag.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function renderPosts(append = false) {
  const markup = state.posts.map((post, index) => `<button class="thumb ${state.selected?.id === post.id ? 'selected' : ''}" data-index="${index}" aria-label="Use ${friendlyName(post)}"><img src="${proxied(post.preview_file_url)}" loading="lazy" alt="${friendlyName(post)}"><span>${post.image_height > post.image_width * 1.15 ? 'PORTRAIT' : 'ART'}</span></button>`).join('');
  if (append) gallery.insertAdjacentHTML('beforeend', markup); else gallery.innerHTML = markup || '<div class="empty">No results. Try fewer tags.</div>';
  gallery.querySelectorAll('.thumb').forEach((button) => button.addEventListener('click', () => selectPost(state.posts[Number(button.dataset.index)])));
}
async function loadPosts(query = $('.search input').value, append = false) {
  if (!append) { state.page = 1; gallery.innerHTML = '<div class="loading">Searching the board…</div>'; }
  $('#more').disabled = true;
  try {
    const response = await fetch(`/api/posts?q=${encodeURIComponent(query)}&page=${state.page}`);
    if (!response.ok) throw new Error('The imageboard could not be reached.');
    const posts = await response.json();
    state.posts = append ? [...state.posts, ...posts] : posts;
    renderPosts(false);
  } catch (error) { gallery.innerHTML = `<div class="empty">${error.message}<br>Try again shortly.</div>`; }
  $('#more').disabled = false;
}
function selectPost(post) {
  if (state.cutoutUrl) URL.revokeObjectURL(state.cutoutUrl);
  state.selected = post; state.cutoutUrl = '';
  art.src = proxied(post.large_file_url || post.file_url);
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

$('.search').addEventListener('submit', (event) => { event.preventDefault(); loadPosts(); });
$('.suggestions').addEventListener('click', (event) => { if (!event.target.dataset.tag) return; $('.search input').value = event.target.dataset.tag; loadPosts(); });
$('#more').addEventListener('click', () => { state.page += 1; loadPosts($('.search input').value, true); });
$('.segmented').addEventListener('click', (event) => { if (!event.target.dataset.mode) return; state.mode = event.target.dataset.mode; document.querySelectorAll('.segmented button').forEach((button) => button.classList.toggle('active', button === event.target)); applyPlacement(); });
['scale', 'x', 'y'].forEach((id) => $(`#${id}`).addEventListener('input', (event) => { state[id] = id === 'scale' ? Number(event.target.value) / 100 : Number(event.target.value); applyPlacement(); }));
$('#reset').addEventListener('click', () => { Object.assign(state, { x: 50, y: 48, scale: 1 }); $('#scale').value = 100; $('#x').value = 50; $('#y').value = 48; applyPlacement(); });
$('#remove-bg').addEventListener('click', async () => {
  if (!state.selected || state.processing) return;
  state.processing = true; $('#remove-bg').disabled = true; $('#remove-bg').innerHTML = '<span class="spinner"></span> Isolating subject…'; $('#process-note').textContent = 'The first run downloads the AI model. This can take a minute.';
  try {
    const { removeBackground } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
    const blob = await removeBackground(proxied(state.selected.large_file_url || state.selected.file_url), { progress: (_key, current, total) => { if (total) $('#process-note').textContent = `Loading background model · ${Math.round(current / total * 100)}%`; } });
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
