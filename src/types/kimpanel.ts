import type GObject from "gi://GObject";

export interface IKimPanel extends GObject.Object {
	h: number;
	relative: boolean;
	scale: number;
	showAux: boolean;
	showLookupTable: boolean;
	showPreedit: boolean;
	w: number;
	x: number;
	y: number;

	getTextStyle(): string;

	isLookupTableVertical(): boolean;

	lookupPageDown(): void;

	lookupPageUp(): void;

	selectCandidate(arg: number): void;

	selectCandidateText(arg: string): void;

	toggleIM(): void;

	triggerProperty(arg: string): void;
}
