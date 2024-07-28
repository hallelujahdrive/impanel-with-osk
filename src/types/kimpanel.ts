import type GObject from "gi://GObject";

export interface IKimPanel extends GObject.Object {
  h: number;
  w: number;
  x: number;
  y: number;

  relative: boolean;
  scale: number;
  showAux: boolean;
  showLookupTable: boolean;
  showPreedit: boolean;

  getTextStyle(): string;

  isLookupTableVertical(): boolean;

  selectCandidate(arg: number): void;

  selectCandidateText(arg: string): void;

  toggleIM(): void;

  triggerProperty(arg: string): void;

}
