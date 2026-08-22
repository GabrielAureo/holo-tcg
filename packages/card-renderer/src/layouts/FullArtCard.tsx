import type { CardDefinition } from '@holo/card-schema';
import type { ArtworkMetrics } from '../CardRenderer';
import { ArtworkStack } from './ArtworkStack';

type FullArtCardProps = {
  card: CardDefinition;
  artworkUrl: string;
  subjectUrl: string;
  onArtworkLoad?: (metrics: ArtworkMetrics) => void;
  onArtworkError?: () => void;
};

export function FullArtCard({ card, artworkUrl, subjectUrl, onArtworkLoad, onArtworkError }: FullArtCardProps) {
  return <>
    <div className="card-backdrop"/><div className="card-rays"/>
    <ArtworkStack card={card} artworkUrl={artworkUrl} subjectUrl={subjectUrl} onArtworkLoad={onArtworkLoad} onArtworkError={onArtworkError}/>
    <div className="card-glare"/>
    <div className="card-copy"><span className="serial">HS–001</span><div><span className="rarity">PRISMATIC</span><h3>{card.content.name || 'UNTITLED'}</h3></div></div>
  </>;
}
