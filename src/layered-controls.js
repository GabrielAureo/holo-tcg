const card = document.querySelector('#card');
const artSubject = document.querySelector('#art-subject');
const holoFieldset = document.querySelector('.foil-picker')?.closest('fieldset');
const holoPicker = document.querySelector('.foil-picker');
const separateButton = document.querySelector('#separate-subject');

let activeLayer = 'background';
let subjectHolo = 'none';

if (holoFieldset) {
  const legend = holoFieldset.querySelector('legend');
  if (legend) legend.textContent = 'Holo style';

  const tabs = document.createElement('div');
  tabs.className = 'layer-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Card layer');
  tabs.innerHTML = `
    <button type="button" class="layer-tab active" data-layer="background" role="tab" aria-selected="true">Background</button>
    <button type="button" class="layer-tab" data-layer="subject" role="tab" aria-selected="false" hidden>Subject</button>`;
  holoPicker?.before(tabs);

  const noneButton = document.createElement('button');
  noneButton.type = 'button';
  noneButton.className = 'foil-option subject-none-option';
  noneButton.dataset.foil = 'none';
  noneButton.hidden = true;
  noneButton.innerHTML = '<span class="foil-option-preview" aria-hidden="true"></span><span>None</span>';
  holoPicker?.prepend(noneButton);
}

const advanced = document.createElement('fieldset');
advanced.className = 'advanced-mask';
advanced.disabled = true;
advanced.hidden = true;
advanced.innerHTML = `<legend>Subject mask</legend>
  <div class="mask-control"><label for="mask-threshold">Threshold <output id="mask-threshold-out">128</output></label><input id="mask-threshold" type="range" min="0" max="255" value="128"></div>
  <div class="mask-control"><label for="mask-feather">Feather <output id="mask-feather-out">24</output></label><input id="mask-feather" type="range" min="0" max="100" value="24"></div>
  <div class="mask-control"><label for="mask-expand">Expand / contract <output id="mask-expand-out">0 px</output></label><input id="mask-expand" type="range" min="-8" max="8" value="0"></div>
  <button type="button" class="mask-reset" id="mask-reset">Reset mask</button>`;
separateButton?.parentElement?.insertBefore(advanced, document.querySelector('#reset'));

let subjectWrap;
let subjectFoil;
if (card && artSubject) {
  subjectWrap = document.createElement('div');
  subjectWrap.className = 'art-layer art-subject art-subject-layer';
  artSubject.before(subjectWrap);
  subjectWrap.appendChild(artSubject);
  artSubject.classList.remove('art-layer', 'art-subject');
  artSubject.classList.add('subject-image');
  subjectFoil = document.createElement('div');
  subjectFoil.className = 'subject-foil';
  subjectFoil.dataset.foil = 'none';
  subjectWrap.appendChild(subjectFoil);
}

const sampler = document.createElement('div');
sampler.className = 'card effect-sampler';
sampler.dataset.foil = 'none';
sampler.innerHTML = '<div class="card-foil"></div>';
document.body.appendChild(sampler);
const samplerFoil = sampler.querySelector('.card-foil');

function setPickerActive(effect) {
  holoPicker?.querySelectorAll('.foil-option').forEach((button) => {
    button.classList.toggle('active', button.dataset.foil === effect);
  });
}

function renderLayerUi() {
  document.querySelectorAll('.layer-tab').forEach((button) => {
    const selected = button.dataset.layer === activeLayer;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });

  const noneButton = holoPicker?.querySelector('.subject-none-option');
  if (noneButton) noneButton.hidden = activeLayer !== 'subject';
  advanced.hidden = activeLayer !== 'subject' || advanced.disabled;

  const effect = activeLayer === 'subject' ? subjectHolo : (card?.dataset.foil || 'classic');
  setPickerActive(effect);
}

function copyEffectFromSampler() {
  if (!subjectFoil || !samplerFoil) return;
  if (sampler.dataset.foil === 'none') {
    subjectFoil.dataset.foil = 'none';
    subjectFoil.removeAttribute('style');
    updateSubjectMask();
    return;
  }
  subjectFoil.dataset.foil = sampler.dataset.foil;
  const style = getComputedStyle(samplerFoil);
  for (const prop of ['background-image','background-size','background-position','background-blend-mode','filter','mix-blend-mode','opacity']) {
    subjectFoil.style.setProperty(prop, style.getPropertyValue(prop));
  }
  updateSubjectMask();
}

function syncSamplerPointer(event) {
  if (!card || !subjectFoil || subjectHolo === 'none') return;
  const rect = card.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const hyp = Math.min(1, Math.hypot(x - .5, y - .5) / Math.SQRT1_2);
  sampler.style.setProperty('--mx', `${x * 100}%`);
  sampler.style.setProperty('--my', `${y * 100}%`);
  sampler.style.setProperty('--posx', `${x * 100}%`);
  sampler.style.setProperty('--posy', `${y * 100}%`);
  sampler.style.setProperty('--hyp', hyp);
  copyEffectFromSampler();
}
card?.addEventListener('pointermove', syncSamplerPointer);

document.querySelector('.layer-tabs')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-layer]');
  if (!button || button.hidden) return;
  activeLayer = button.dataset.layer;
  renderLayerUi();
});

holoPicker?.addEventListener('click', (event) => {
  if (activeLayer !== 'subject') return;
  const button = event.target.closest('.foil-option[data-foil]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  subjectHolo = button.dataset.foil;
  sampler.dataset.foil = subjectHolo;
  copyEffectFromSampler();
  setPickerActive(subjectHolo);
}, true);

let baseCutoutBuffer = null;
let baseCutoutType = 'image/png';
let baseCutoutSrc = '';
let refinedUrl = '';
let refinementWrite = false;
let refineSequence = 0;
let refineTimer = null;
const refineWorker = new Worker('/src/mask-refine-worker.js', { type: 'module' });

function updateSubjectMask() {
  if (!subjectFoil || !artSubject?.src) return;
  const mask = `url("${artSubject.src}")`;
  subjectFoil.style.maskImage = mask;
  subjectFoil.style.webkitMaskImage = mask;
}

async function captureBaseCutout() {
  if (!artSubject?.src || artSubject.hidden) return;
  const response = await fetch(artSubject.src);
  if (!response.ok) return;
  baseCutoutType = response.headers.get('content-type') || 'image/png';
  baseCutoutBuffer = await response.arrayBuffer();
  baseCutoutSrc = artSubject.src;
  advanced.disabled = false;
  const subjectTab = document.querySelector('.layer-tab[data-layer="subject"]');
  if (subjectTab) subjectTab.hidden = false;
  updateSubjectMask();
  renderLayerUi();
}

const subjectObserver = new MutationObserver(() => {
  if (artSubject.hidden || !artSubject.getAttribute('src')) {
    baseCutoutBuffer = null;
    baseCutoutSrc = '';
    advanced.disabled = true;
    advanced.hidden = true;
    subjectHolo = 'none';
    sampler.dataset.foil = 'none';
    copyEffectFromSampler();
    const subjectTab = document.querySelector('.layer-tab[data-layer="subject"]');
    if (subjectTab) subjectTab.hidden = true;
    activeLayer = 'background';
    renderLayerUi();
    return;
  }
  updateSubjectMask();
  if (refinementWrite) { refinementWrite = false; return; }
  captureBaseCutout().catch(() => {});
});
if (artSubject) subjectObserver.observe(artSubject, { attributes: true, attributeFilter: ['src', 'hidden'] });

function maskSettings() {
  return {
    threshold: Number(document.querySelector('#mask-threshold')?.value || 128),
    feather: Number(document.querySelector('#mask-feather')?.value || 24),
    expand: Number(document.querySelector('#mask-expand')?.value || 0),
  };
}
function renderMaskOutputs() {
  const settings = maskSettings();
  document.querySelector('#mask-threshold-out').value = settings.threshold;
  document.querySelector('#mask-feather-out').value = settings.feather;
  document.querySelector('#mask-expand-out').value = `${settings.expand} px`;
}
function refineMask() {
  if (!baseCutoutBuffer) return;
  const id = ++refineSequence;
  refineWorker.postMessage({ id, buffer: baseCutoutBuffer, contentType: baseCutoutType, settings: maskSettings() });
}
refineWorker.addEventListener('message', (event) => {
  const { type, id, buffer, contentType, message } = event.data || {};
  if (id !== refineSequence) return;
  if (type === 'error') {
    const note = document.querySelector('#process-note');
    if (note) { note.hidden = false; note.textContent = `Could not refine subject mask: ${message}`; }
    return;
  }
  if (type !== 'done') return;
  if (refinedUrl) URL.revokeObjectURL(refinedUrl);
  refinedUrl = URL.createObjectURL(new Blob([buffer], { type: contentType || 'image/png' }));
  refinementWrite = true;
  artSubject.src = refinedUrl;
  updateSubjectMask();
});

for (const id of ['mask-threshold', 'mask-feather', 'mask-expand']) {
  document.querySelector(`#${id}`)?.addEventListener('input', () => {
    renderMaskOutputs();
    clearTimeout(refineTimer);
    refineTimer = setTimeout(refineMask, 120);
  });
}
document.querySelector('#mask-reset')?.addEventListener('click', () => {
  document.querySelector('#mask-threshold').value = 128;
  document.querySelector('#mask-feather').value = 24;
  document.querySelector('#mask-expand').value = 0;
  renderMaskOutputs();
  if (baseCutoutSrc) {
    if (refinedUrl) { URL.revokeObjectURL(refinedUrl); refinedUrl = ''; }
    refinementWrite = true;
    artSubject.src = baseCutoutSrc;
    updateSubjectMask();
  }
});

renderMaskOutputs();
renderLayerUi();
