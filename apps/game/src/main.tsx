import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CardRenderer } from '@holo/card-renderer';
import type { CardDefinition } from '@holo/card-schema';
import './style.css';

type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
type CardTemplate = {
  id: string;
  name: string;
  artworkUrl: string;
  rarity: Rarity;
  baseGoldPerMinute: number;
};
type OwnedCard = {
  id: string;
  templateId: string;
  foil: string;
  acquiredAt: number;
};
type GameState = {
  gold: number;
  cards: OwnedCard[];
  lastTickAt: number;
  lastDropAt: number | null;
};

const DROP_INTERVAL_MS = 30 * 60 * 1000;
const STORAGE_KEY = 'holo-drop-state-v1';
const HOLO_MULTIPLIER = 2.5;
const FOILS = ['classic', 'galaxy', 'prism', 'fullart', 'gold'] as const;
const RARITY_WEIGHT: Record<Rarity, number> = { common: 62, uncommon: 25, rare: 10, legendary: 3 };
const HOLO_CHANCE: Record<Rarity, number> = { common: .06, uncommon: .1, rare: .2, legendary: .35 };

const CATALOG: CardTemplate[] = [
  { id: 'ashen-fox', name: 'Ashen Fox', artworkUrl: 'https://picsum.photos/seed/ashen-fox/720/1008', rarity: 'common', baseGoldPerMinute: 1 },
  { id: 'moon-archer', name: 'Moon Archer', artworkUrl: 'https://picsum.photos/seed/moon-archer/720/1008', rarity: 'common', baseGoldPerMinute: 1.2 },
  { id: 'glass-witch', name: 'Glass Witch', artworkUrl: 'https://picsum.photos/seed/glass-witch/720/1008', rarity: 'uncommon', baseGoldPerMinute: 2.6 },
  { id: 'storm-idol', name: 'Storm Idol', artworkUrl: 'https://picsum.photos/seed/storm-idol/720/1008', rarity: 'uncommon', baseGoldPerMinute: 3 },
  { id: 'void-knight', name: 'Void Knight', artworkUrl: 'https://picsum.photos/seed/void-knight/720/1008', rarity: 'rare', baseGoldPerMinute: 7.5 },
  { id: 'sun-eater', name: 'Sun Eater', artworkUrl: 'https://picsum.photos/seed/sun-eater/720/1008', rarity: 'legendary', baseGoldPerMinute: 22 },
];

function freshState(): GameState {
  return { gold: 0, cards: [], lastTickAt: Date.now(), lastDropAt: null };
}

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw) as GameState;
    return { ...parsed, lastTickAt: parsed.lastTickAt || Date.now() };
  } catch {
    return freshState();
  }
}

function templateFor(card: OwnedCard) {
  return CATALOG.find((template) => template.id === card.templateId) ?? CATALOG[0];
}

function incomePerMinute(cards: OwnedCard[]) {
  return cards.reduce((sum, card) => {
    const base = templateFor(card).baseGoldPerMinute;
    return sum + base * (card.foil === 'none' ? 1 : HOLO_MULTIPLIER);
  }, 0);
}

function settleGold(state: GameState, now = Date.now()): GameState {
  const elapsedMinutes = Math.max(0, now - state.lastTickAt) / 60000;
  return { ...state, gold: state.gold + incomePerMinute(state.cards) * elapsedMinutes, lastTickAt: now };
}

function weightedRarity() {
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const rarity of ['common', 'uncommon', 'rare', 'legendary'] as const) {
    cursor += RARITY_WEIGHT[rarity];
    if (roll < cursor) return rarity;
  }
  return 'common' as const;
}

function createDrop(): OwnedCard {
  const rarity = weightedRarity();
  const pool = CATALOG.filter((card) => card.rarity === rarity);
  const template = pool[Math.floor(Math.random() * pool.length)] ?? CATALOG[0];
  const holo = Math.random() < HOLO_CHANCE[rarity];
  const foil = holo ? FOILS[Math.floor(Math.random() * FOILS.length)] : 'none';
  return { id: crypto.randomUUID(), templateId: template.id, foil, acquiredAt: Date.now() };
}

function definitionFor(card: OwnedCard): CardDefinition {
  const template = templateFor(card);
  return {
    version: 2,
    layout: 'full-art',
    artwork: {
      url: template.artworkUrl,
      name: template.name,
      x: 50,
      y: 50,
      scale: 1.3,
      subject: { separated: false, mask: { threshold: 128, feather: 24, expand: 0 } },
    },
    content: { name: template.name, attack: 100, defense: 100, description: `${template.rarity} drop` },
    appearance: { backgroundFoil: card.foil, subjectFoil: 'none', frameFoil: 'none', back: 'aurora' },
  };
}

function formatGold(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60).toString().padStart(2, '0');
  const seconds = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function Game() {
  const [state, setState] = useState<GameState>(() => settleGold(loadState()));
  const [now, setNow] = useState(Date.now());
  const [latestDropId, setLatestDropId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setState((current) => settleGold(current, tick));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const income = useMemo(() => incomePerMinute(state.cards), [state.cards]);
  const nextDropAt = state.lastDropAt === null ? 0 : state.lastDropAt + DROP_INTERVAL_MS;
  const remaining = Math.max(0, nextDropAt - now);
  const canDrop = remaining === 0;
  const latestDrop = latestDropId ? state.cards.find((card) => card.id === latestDropId) ?? null : null;

  function claimDrop() {
    if (!canDrop) return;
    const dropped = createDrop();
    const tick = Date.now();
    setNow(tick);
    setLatestDropId(dropped.id);
    setState((current) => {
      const settled = settleGold(current, tick);
      return { ...settled, cards: [dropped, ...settled.cards], lastDropAt: tick };
    });
  }

  return <main className="game-shell">
    <div className="world-glow world-glow-left" aria-hidden="true" />
    <div className="world-glow world-glow-right" aria-hidden="true" />

    <header className="game-hud">
      <div className="brand-mark">
        <span className="brand-sigil">H</span>
        <div><strong>HOLO DROP</strong><small>ARCHIVE // 01</small></div>
      </div>
      <div className="hud-resources">
        <div className="hud-stat gold-stat"><span className="resource-orb">◆</span><div><small>GOLD</small><strong>{formatGold(state.gold)}</strong></div></div>
        <div className="hud-stat"><small>FLOW</small><strong>+{formatGold(income)}<em>/min</em></strong></div>
        <div className="hud-stat"><small>CARDS</small><strong>{state.cards.length}</strong></div>
      </div>
    </header>

    <section className={`drop-stage ${canDrop ? 'is-ready' : ''}`}>
      <div className="stage-copy">
        <span className="stage-index">DROP // 001</span>
        <p className="stage-kicker">THE ARCHIVE IS LISTENING</p>
        <h1>{canDrop ? <>A new card<br /><i>has surfaced.</i></> : <>Next signal in<br /><i>{formatCountdown(remaining)}</i></>}</h1>
        <p className="stage-lore">Every pull joins your collection and feeds the gold stream. Holographic variants are scarce and generate {HOLO_MULTIPLIER}× more.</p>
      </div>

      <div className="drop-core">
        <div className="drop-rings" aria-hidden="true"><i /><i /><i /></div>
        <div className="drop-card-back" aria-hidden="true"><span>H</span></div>
        <button className="summon-button" disabled={!canDrop} onClick={claimDrop}>
          <span>{canDrop ? 'CLAIM DROP' : formatCountdown(remaining)}</span>
          <small>{canDrop ? 'FREE SIGNAL' : 'RECHARGING'}</small>
        </button>
      </div>
    </section>

    {latestDrop && <section className="reward-reveal">
      <div className="reward-card-wrap">
        <div className="reward-aura" aria-hidden="true" />
        <CardRenderer card={definitionFor(latestDrop)} interactive className="featured-card" />
      </div>
      <div className="reward-copy">
        <span className={`rarity-mark rarity-${templateFor(latestDrop).rarity}`}>{templateFor(latestDrop).rarity}</span>
        <p className="reward-kicker">NEW ENTRY ACQUIRED</p>
        <h2>{templateFor(latestDrop).name}</h2>
        <div className="reward-stats">
          <div><small>YIELD</small><strong>+{formatGold(templateFor(latestDrop).baseGoldPerMinute * (latestDrop.foil === 'none' ? 1 : HOLO_MULTIPLIER))}</strong><span>gold / min</span></div>
          <div><small>FINISH</small><strong>{latestDrop.foil === 'none' ? 'BASE' : latestDrop.foil.toUpperCase()}</strong><span>{latestDrop.foil === 'none' ? 'standard print' : `${HOLO_MULTIPLIER}× holo yield`}</span></div>
        </div>
      </div>
    </section>}

    <section className="collection-section">
      <div className="collection-heading">
        <div><span className="stage-index">COLLECTION // ARCHIVE</span><h2>Recovered cards</h2></div>
        <div className="collection-total"><small>TOTAL FLOW</small><strong>+{formatGold(income)}</strong><span>gold / min</span></div>
      </div>

      {state.cards.length === 0 ? <div className="empty-vault">
        <div className="empty-glyph">◇</div>
        <strong>The archive is empty.</strong>
        <span>Claim your first signal above.</span>
      </div> : <div className="card-grid">
        {state.cards.map((owned, index) => {
          const template = templateFor(owned);
          const perMinute = template.baseGoldPerMinute * (owned.foil === 'none' ? 1 : HOLO_MULTIPLIER);
          return <article className={`collection-card rarity-border-${template.rarity}`} key={owned.id} style={{ '--card-index': index } as React.CSSProperties}>
            <div className="collection-card-renderer"><CardRenderer card={definitionFor(owned)} interactive className="mini-card" /></div>
            <footer className="collection-card-info">
              <div><span className={`rarity-dot rarity-${template.rarity}`} /> <small>{template.rarity}</small><strong>{template.name}</strong></div>
              <div className="card-yield"><strong>+{formatGold(perMinute)}</strong><small>/ min</small></div>
            </footer>
            {owned.foil !== 'none' && <span className="foil-badge">✦ {owned.foil}</span>}
          </article>;
        })}
      </div>}
    </section>
  </main>;
}

createRoot(document.getElementById('app')!).render(<Game />);
