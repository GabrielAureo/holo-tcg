import type { CardDefinition } from '@holo/card-schema';
import type { ArtworkMetrics } from '../CardRenderer';
import { ArtworkStack } from './ArtworkStack';

type StandardCardProps = {
  card: CardDefinition;
  artworkUrl: string;
  subjectUrl: string;
  onArtworkLoad?: (metrics: ArtworkMetrics) => void;
  onArtworkError?: () => void;
};

export function StandardCard({ card, artworkUrl, subjectUrl, onArtworkLoad, onArtworkError }: StandardCardProps) {
  return <>
    <div className="standard-card-surface" aria-hidden="true"/>
    <div className="standard-card-frame" aria-hidden="true"/>
    <div className="standard-card-header">
      <span className="standard-card-kicker">HOLO / STANDARD</span>
      <h3>{card.content.name || 'UNTITLED'}</h3>
    </div>
    <div className="standard-art-window">
      <ArtworkStack card={card} artworkUrl={artworkUrl} subjectUrl={subjectUrl} onArtworkLoad={onArtworkLoad} onArtworkError={onArtworkError}/>
      <div className="standard-art-border" aria-hidden="true"/>
    </div>
    <div className="standard-card-details">
      <div className="standard-card-stats">
        <div><span>ATK</span><strong>{card.content.attack}</strong></div>
        <div><span>DEF</span><strong>{card.content.defense}</strong></div>
      </div>
      <p>{card.content.description || 'No description.'}</p>
      <div className="standard-card-meta"><span>HS–001</span><span>PRISMATIC</span></div>
    </div>
    <div className="card-glare"/>
  </>;
}
