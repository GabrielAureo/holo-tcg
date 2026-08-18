const query = new URLSearchParams(location.search);
const image = query.get('img');
const restoreSeparated = query.get('separated') === '1';

if (image) {
  const cardShell = document.querySelector('#card-shell');
  const artBg = document.querySelector('#art-bg');
  const stage = cardShell?.closest('.stage');

  if (cardShell && stage) {
    cardShell.style.visibility = 'hidden';

    const style = document.createElement('style');
    style.textContent = `
      .shared-card-loader {
        min-height: 100%;
        display: grid;
        place-items: center;
        gap: 12px;
        align-content: center;
        color: rgba(255,255,255,.7);
        font-size: 12px;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
      .shared-card-loader-spinner {
        width: 30px;
        height: 30px;
        border: 2px solid rgba(255,255,255,.14);
        border-top-color: currentColor;
        border-radius: 999px;
        animation: shared-card-loader-spin .8s linear infinite;
      }
      @keyframes shared-card-loader-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    const loader = document.createElement('div');
    loader.className = 'shared-card-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.innerHTML = '<span class="shared-card-loader-spinner" aria-hidden="true"></span><span>Loading shared card…</span>';
    cardShell.before(loader);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        loader.remove();
        style.remove();
        cardShell.style.visibility = '';
      }));
    };

    if (restoreSeparated) {
      const observer = new MutationObserver(() => {
        if (!cardShell.hasAttribute('aria-busy')) {
          observer.disconnect();
          finish();
        }
      });
      observer.observe(cardShell, { attributes: true, attributeFilter: ['aria-busy'] });

      // share-state sets aria-busy synchronously when restoring a separated card.
      requestAnimationFrame(() => {
        if (!cardShell.hasAttribute('aria-busy')) finish();
      });
    } else if (artBg) {
      artBg.addEventListener('load', finish, { once: true });
      artBg.addEventListener('error', finish, { once: true });
    } else {
      finish();
    }
  }
}
