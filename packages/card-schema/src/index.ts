export type CardArtMode = 'full' | 'frame';

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
  mode: CardArtMode;
  subject?: CardSubjectDefinition;
}

export interface CardAppearanceDefinition {
  backgroundFoil: string;
  subjectFoil: string;
  back: string;
}

export interface CardDefinition {
  version: 1;
  artwork: CardArtworkDefinition;
  appearance: CardAppearanceDefinition;
}
