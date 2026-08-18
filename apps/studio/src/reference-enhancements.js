const card = document.querySelector('#card');

const labels = {
  classic: 'Holo',
  galaxy: 'Galaxy',
  prism: 'VMAX',
  fullart: 'Rainbow',
  gold: 'Gold / Secret',
};

document.querySelectorAll('.foil-option[data-foil]').forEach((button) => {
  button.textContent = labels[button.dataset.foil] || button.textContent;
});

document.querySelector('.status')?.remove();
document.querySelector('.layer-note')?.remove();
const intro = document.querySelector('.intro > p:last-child');
if (intro) intro.textContent = 'Browse anime artwork and apply interactive holographic card finishes.';
const processNote = document.querySelector('#process-note');
if (processNote) processNote.hidden = true;

card?.addEventListener('pointermove', (event) => {
  const rect = card.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const hyp = Math.min(1, Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2);
  card.style.setProperty('--posx', `${x * 100}%`);
  card.style.setProperty('--posy', `${y * 100}%`);
  card.style.setProperty('--hyp', hyp);
});
