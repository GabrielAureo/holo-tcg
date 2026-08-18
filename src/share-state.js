const artBg = document.querySelector('#art-bg');
const artSubject = document.querySelector('#art-subject');
const card = document.querySelector('#card');
const cardShell = document.querySelector('#card-shell');
const cardName = document.querySelector('#card-name');
const holoPicker = document.querySelector('.foil-picker');
const backPicker = document.querySelector('.back-picker');
const modePicker = document.querySelector('.segmented');
const scaleInput = document.querySelector('#scale');
const xInput = document.querySelector('#x');
const yInput = document.querySelector('#y');
const resetButton = document.querySelector('#reset');
const separateButton = document.querySelector('#separate-subject');
const processNote = document.querySelector('#process-note');

const query = new URLSearchParams(location.search);
const sharedImage = query.get('img') || '';
const restoreSeparated = query.get('separated') === '1';
let restoring = false;
let syncTimer = null;
let sharedCutoutUrl = '';
let sharedSeparating = false;

if (restoreSeparated && cardShell) {
  cardShell.style.visibility = 'hidden';
  cardShell.setAttribute('aria-busy', 'true');
}

function originalImageUrl() {
  if (!artBg?.src) return '';
  try {
    const current = new URL(artBg.src, location.href);
    if (current.pathname === '/api/image') return current.searchParams.get('url') || '';
    if (/^https?:$/.test(current.protocol)) return current.href;
  } catch {}
  return '';
}

function isCurrentSharedArtwork() {
  return Boolean(sharedImage && originalImageUrl() === sharedImage);
}

function currentMode() {
  return modePicker?.querySelector('button.active')?.dataset.mode || 'full';
}

function currentBack() {
  return backPicker?.querySelector('.back-option.active')?.dataset.back || 'aurora';
}

function currentSubjectFoil() {
  return document.querySelector('.subject-foil')?.dataset.foil || 'none';
}

function isSeparated() {
  return Boolean(artSubject?.src && !artSubject.hidden);
}

function compactNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : fallback;
}

function syncUrl() {
  if (restoring) return;
  const image = originalImageUrl();
  if (!image) return;

  const params = new URLSearchParams();
  params.set('img', image);

  const name = cardName?.textContent?.trim();
  if (name && name !== 'SELECT AN ARTWORK') params.set('name', name);

  params.set('foil', card?.dataset.foil || 'classic');
  params.set('back', currentBack());
  params.set('mode', currentMode());
  params.set('x', compactNumber(xInput?.value, '50'));
  params.set('y', compactNumber(yInput?.value, '48'));
  params.set('scale', compactNumber(Number(scaleInput?.value || 100) / 100, '1'));

  if (isSeparated()) {
    params.set('separated', '1');
    params.set('maskThreshold', compactNumber(document.querySelector('#mask-threshold')?.value, '128'));
    params.set('maskFeather', compactNumber(document.querySelector('#mask-feather')?.value, '24'));
    params.set('maskExpand', compactNumber(document.querySelector('#mask-expand')?.value, '0'));
    params.set('subjectFoil', currentSubjectFoil());
  }

  const next = `${location.pathname}?${params.toString()}${location.hash}`;
  history.replaceState(null, '', next);
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncUrl, 60);
}

function clickOption(root, selector) {
  const button = root?.querySelector(selector);
  button?.click();
}

function dispatchRange(input, value) {
  if (!input || value == null) return;
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setRange(input, value) {
  if (!input || value == null) return;
  input.value = String(value);
}

function waitFor(predicate, timeout = 15000) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (performance.now() - started >= timeout) return reject(new Error('Timed out restoring shared subject'));
      requestAnimationFrame(check);
    };
    check();
  });
}

async function separateImage(image) {
  const response = await fetch(`/api/image?url=${encodeURIComponent(image)}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Image proxy returned ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`Expected image data but received ${contentType || 'unknown content type'}`);
  const buffer = await response.arrayBuffer();
  const worker = new Worker('/src/background-worker.js', { type: 'module' });
  const id = 1;

  return new Promise((resolve, reject) => {
    const finish = () => worker.terminate();
    worker.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.id !== id || message.type === 'progress') return;
      finish();
      if (message.type === 'done') resolve(new Blob([message.buffer], { type: message.contentType || 'image/png' }));
      else reject(new Error(message.message || 'Subject separation failed'));
    });
    worker.addEventListener('error', (event) => {
      finish();
      reject(new Error(event.message || 'Background worker failed'));
    }, { once: true });
    worker.postMessage({ id, buffer, contentType }, [buffer]);
  });
}

function applySharedCutout(blob, requestedName) {
  if (!artSubject || !card) return;
  if (sharedCutoutUrl) URL.revokeObjectURL(sharedCutoutUrl);
  sharedCutoutUrl = URL.createObjectURL(blob);
  artSubject.src = sharedCutoutUrl;
  artSubject.hidden = false;
  artSubject.alt = `${requestedName || 'Shared artwork'} foreground`;
  card.classList.add('has-subject');
}

async function restoreSubject(image, requestedName) {
  if (!artSubject || !card) return;
  if (processNote) processNote.textContent = 'Restoring separated subject…';

  const blob = await separateImage(image);
  applySharedCutout(blob, requestedName);

  await waitFor(() => {
    const advanced = document.querySelector('.advanced-mask');
    return advanced && !advanced.disabled;
  });

  const threshold = query.get('maskThreshold') ?? '128';
  const feather = query.get('maskFeather') ?? '24';
  const expand = query.get('maskExpand') ?? '0';
  const thresholdInput = document.querySelector('#mask-threshold');
  const featherInput = document.querySelector('#mask-feather');
  const expandInput = document.querySelector('#mask-expand');
  const needsRefinement = threshold !== '128' || feather !== '24' || expand !== '0';
  const baseSubjectSrc = artSubject.src;

  setRange(thresholdInput, threshold);
  setRange(featherInput, feather);
  setRange(expandInput, expand);

  if (needsRefinement) {
    dispatchRange(expandInput, expand);
    await waitFor(() => artSubject.src !== baseSubjectSrc);
  }

  const subjectFoil = query.get('subjectFoil');
  if (subjectFoil) {
    clickOption(document, '.layer-tab[data-layer="subject"]');
    clickOption(holoPicker, `.foil-option[data-foil="${CSS.escape(subjectFoil)}"]`);
    clickOption(document, '.layer-tab[data-layer="background"]');
  }

  if (processNote) processNote.textContent = '';
}

async function separateCurrentSharedArtwork() {
  if (!isCurrentSharedArtwork() || sharedSeparating || !separateButton) return;
  sharedSeparating = true;
  separateButton.disabled = true;
  separateButton.innerHTML = '<span class="spinner"></span> Separating…';
  if (processNote) processNote.textContent = '';

  try {
    const blob = await separateImage(sharedImage);
    applySharedCutout(blob, cardName?.textContent?.trim());
    separateButton.innerHTML = '<span>✦</span> Separate again';
    scheduleSync();
  } catch (error) {
    if (processNote) processNote.textContent = `Could not separate subject: ${error.message}`;
    separateButton.innerHTML = '<span>✦</span> Try again';
  } finally {
    sharedSeparating = false;
    separateButton.disabled = false;
  }
}

async function restoreFromQuery() {
  const image = sharedImage;
  if (!image || !artBg) return false;

  restoring = true;
  const requestedName = query.get('name');
  if (requestedName && cardName) cardName.textContent = requestedName;
  artBg.alt = requestedName || 'Shared artwork';

  try {
    await new Promise((resolve, reject) => {
      artBg.addEventListener('load', resolve, { once: true });
      artBg.addEventListener('error', () => reject(new Error('Shared artwork failed to load')), { once: true });
      artBg.src = `/api/image?url=${encodeURIComponent(image)}`;
    });

    const foil = query.get('foil');
    const back = query.get('back');
    const mode = query.get('mode');
    const x = query.get('x');
    const y = query.get('y');
    const scale = Number(query.get('scale'));

    if (foil) clickOption(holoPicker, `.foil-option[data-foil="${CSS.escape(foil)}"]`);
    if (back) clickOption(backPicker, `.back-option[data-back="${CSS.escape(back)}"]`);
    if (mode) clickOption(modePicker, `button[data-mode="${CSS.escape(mode)}"]`);
    if (x != null) dispatchRange(xInput, x);
    if (y != null) dispatchRange(yInput, y);
    if (Number.isFinite(scale) && scale > 0) dispatchRange(scaleInput, Math.round(scale * 100));

    if (restoreSeparated) await restoreSubject(image, requestedName);
  } catch (error) {
    if (processNote) processNote.textContent = `Could not restore shared card: ${error.message}`;
  } finally {
    restoring = false;
    if (cardShell) {
      cardShell.style.visibility = '';
      cardShell.removeAttribute('aria-busy');
    }
    if (separateButton && isCurrentSharedArtwork()) {
      separateButton.disabled = false;
      separateButton.innerHTML = isSeparated()
        ? '<span>✦</span> Separate again'
        : '<span>✦</span> Separate subject';
    }
    syncUrl();
  }

  return true;
}

for (const input of [scaleInput, xInput, yInput]) input?.addEventListener('input', scheduleSync);
holoPicker?.addEventListener('click', scheduleSync);
backPicker?.addEventListener('click', scheduleSync);
modePicker?.addEventListener('click', scheduleSync);
resetButton?.addEventListener('click', () => requestAnimationFrame(scheduleSync));
for (const id of ['mask-threshold', 'mask-feather', 'mask-expand']) {
  document.querySelector(`#${id}`)?.addEventListener('input', scheduleSync);
}

if (artBg) new MutationObserver(scheduleSync).observe(artBg, { attributes: true, attributeFilter: ['src'] });
if (artSubject) new MutationObserver(scheduleSync).observe(artSubject, { attributes: true, attributeFilter: ['src', 'hidden'] });
if (cardName) new MutationObserver(scheduleSync).observe(cardName, { childList: true, characterData: true, subtree: true });
const subjectFoil = document.querySelector('.subject-foil');
if (subjectFoil) new MutationObserver(scheduleSync).observe(subjectFoil, { attributes: true, attributeFilter: ['data-foil'] });

separateButton?.addEventListener('click', (event) => {
  if (!isCurrentSharedArtwork()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  separateCurrentSharedArtwork();
}, true);

if (sharedImage && separateButton) separateButton.disabled = true;
const restored = await restoreFromQuery();
if (!restored) scheduleSync();
