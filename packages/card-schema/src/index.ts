export type CardLayout = 'full-art' | 'standard';

export interface CardMaskSettings {
  threshold: number;
  feather: number;
  expand: number;
}

export interface CardSubjectDefinition {
  separated: boolean;
  mask: CardMaskSettings;
}

export interface CardArtworkDefinition {
  url: string;
  name?: string;
  x: number;
  y: number;
  scale: number;
  subject?: CardSubjectDefinition;
}

export interface CardContentDefinition {
  name: string;
  attack: number;
  defense: number;
  description: string;
}

export interface CardAppearanceDefinition {
  backgroundFoil: string;
  subjectFoil: string;
  frameFoil: string;
  back: string;
}

export interface CardDefinition {
  version: 2;
  layout: CardLayout;
  artwork: CardArtworkDefinition;
  content: CardContentDefinition;
  appearance: CardAppearanceDefinition;
}
