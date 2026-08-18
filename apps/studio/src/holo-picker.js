const picker = document.querySelector('.foil-picker');
if (picker) {
  const active = picker.querySelector('.foil-option.active')?.dataset.foil || 'classic';
  const patterns = [
    ['classic', 'Holo'], ['galaxy', 'Galaxy'], ['holo-v', 'Holo V'], ['prism', 'VMAX'], ['vstar', 'VSTAR'],
    ['ultra', 'Full / Alt Art'], ['trainer', 'Trainer Full Art'], ['fullart', 'Rainbow'], ['rainbow-alt', 'Rainbow Alt'],
    ['gold', 'Gold / Secret'], ['radiant', 'Radiant'], ['gallery', 'Trainer Gallery'], ['gallery-v', 'Gallery V'], ['gallery-vmax', 'Gallery VMAX'],
  ];
  picker.innerHTML = patterns.map(([id, label]) => `<button type="button" class="foil-option ${id === active ? 'active' : ''}" data-foil="${id}"><span class="foil-option-preview" aria-hidden="true"></span><span>${label}</span></button>`).join('');

  for (const button of picker.querySelectorAll('.foil-option')) {
    const preview = button.querySelector('.foil-option-preview');
    button.addEventListener('pointermove', (event) => {
      const rect = button.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      const hyp = Math.min(1, Math.hypot(x - .5, y - .5) / Math.SQRT1_2);
      preview.style.setProperty('--mx', `${x * 100}%`);
      preview.style.setProperty('--my', `${y * 100}%`);
      preview.style.setProperty('--posx', `${x * 100}%`);
      preview.style.setProperty('--posy', `${y * 100}%`);
      preview.style.setProperty('--hyp', hyp);
    });
  }
}
