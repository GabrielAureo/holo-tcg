const cardShell = document.querySelector('#card-shell');
const artBg = document.querySelector('#art-bg');
const xInput = document.querySelector('#x');
const yInput = document.querySelector('#y');
const scaleInput = document.querySelector('#scale');

for (const input of [xInput, yInput]) {
  input?.closest('.control')?.setAttribute('hidden', '');
}

let drag = null;
let suppressNextClick = false;
const DRAG_THRESHOLD = 7;

function dispatchInput(input, value) {
  if (!input) return;
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function centerArtwork() {
  dispatchInput(xInput, 50);
  dispatchInput(yInput, 50);
}

function fitArtworkToCard() {
  if (!artBg?.naturalWidth || !artBg?.naturalHeight || !cardShell) return;

  const rect = cardShell.getBoundingClientRect();
  const baseHeight = Number.parseFloat(getComputedStyle(artBg).height);
  if (!rect.width || !rect.height || !baseHeight) return;

  const imageAspect = artBg.naturalWidth / artBg.naturalHeight;
  const baseWidth = baseHeight * imageAspect;
  const coverScale = Math.max(rect.width / baseWidth, rect.height / baseHeight);
  const min = Number(scaleInput?.min || 50) / 100;
  const max = Number(scaleInput?.max || 220) / 100;
  const scale = Math.max(min, Math.min(max, coverScale));

  centerArtwork();
  dispatchInput(scaleInput, Math.round(scale * 100));
}

artBg?.addEventListener('load', fitArtworkToCard);

cardShell?.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || cardShell.classList.contains('flipped')) return;

  drag = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: Number(xInput?.value || 50),
    startY: Number(yInput?.value || 50),
    active: false,
  };
  cardShell.setPointerCapture?.(event.pointerId);
}, true);

cardShell?.addEventListener('pointermove', (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;

  const dx = event.clientX - drag.startClientX;
  const dy = event.clientY - drag.startClientY;

  if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

  drag.active = true;
  cardShell.classList.add('dragging-art');
  event.stopPropagation();

  const rect = cardShell.getBoundingClientRect();
  const nextX = Math.max(0, Math.min(100, drag.startX + (dx / rect.width) * 100));
  const nextY = Math.max(0, Math.min(100, drag.startY + (dy / rect.height) * 100));

  dispatchInput(xInput, nextX);
  dispatchInput(yInput, nextY);
}, true);

function endDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  suppressNextClick = event.type === 'pointerup' && drag.active;
  cardShell.classList.remove('dragging-art');
  cardShell.releasePointerCapture?.(event.pointerId);
  drag = null;
}

cardShell?.addEventListener('pointerup', endDrag, true);
cardShell?.addEventListener('pointercancel', endDrag, true);

cardShell?.addEventListener('click', (event) => {
  if (!suppressNextClick) return;
  suppressNextClick = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.querySelector('#reset')?.addEventListener('click', () => {
  requestAnimationFrame(() => {
    centerArtwork();
    fitArtworkToCard();
  });
});
