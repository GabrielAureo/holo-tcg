import { useRef, type PointerEvent } from 'react';
import './HoloEffectPreview.css';

export interface HoloEffectPreviewProps {
  foil: string;
  className?: string;
}

export function HoloEffectPreview({ foil, className = '' }: HoloEffectPreviewProps) {
  const ref = useRef<HTMLSpanElement>(null);

  function handlePointerMove(event: PointerEvent<HTMLSpanElement>) {
    const node = ref.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const hyp = Math.min(1, Math.hypot(x - .5, y - .5) / Math.SQRT1_2);

    node.style.setProperty('--mx', `${x * 100}%`);
    node.style.setProperty('--my', `${y * 100}%`);
    node.style.setProperty('--posx', `${x * 100}%`);
    node.style.setProperty('--posy', `${y * 100}%`);
    node.style.setProperty('--hyp', String(hyp));
  }

  return (
    <span
      ref={ref}
      className={`card holo-effect-preview ${className}`.trim()}
      data-foil={foil}
      onPointerMove={handlePointerMove}
      aria-hidden="true"
    >
      <span className="card-foil" />
    </span>
  );
}
