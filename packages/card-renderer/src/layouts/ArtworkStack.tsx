import type { CSSProperties } from 'react';
import type { CardDefinition } from '@holo/card-schema';
import type { ArtworkMetrics } from '../CardRenderer';

type ArtworkStackProps = {
  card: CardDefinition;
  artworkUrl: string;
  subjectUrl: string;
  onArtworkLoad?: (metrics: ArtworkMetrics) => void;
  onArtworkError?: () => void;
};

export function ArtworkStack({ card, artworkUrl, subjectUrl, onArtworkLoad, onArtworkError }: ArtworkStackProps) {
  return <>
    {artworkUrl && <img className="art-layer art-background" src={artworkUrl} alt={card.artwork.name || 'Card artwork'} onLoad={(event) => onArtworkLoad?.({ naturalWidth: event.currentTarget.naturalWidth, naturalHeight: event.currentTarget.naturalHeight })} onError={onArtworkError}/>} 
    <div className="card background-effect" data-foil={card.appearance.backgroundFoil} aria-hidden="true"><div className="card-foil"/></div>
    {subjectUrl && <div className="art-layer art-subject-layer"><img className="subject-image" src={subjectUrl} alt={`${card.artwork.name || 'Card artwork'} foreground`}/>{card.appearance.subjectFoil !== 'none' && <div className="card subject-effect" data-foil={card.appearance.subjectFoil} style={{ maskImage: `url(${subjectUrl})`, WebkitMaskImage: `url(${subjectUrl})` } as CSSProperties} aria-hidden="true"><div className="card-foil"/></div>}</div>}
  </>;
}
