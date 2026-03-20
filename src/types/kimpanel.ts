import type GObject from "gi://GObject";

export interface IKimPanel extends GObject.Object {
	getTextStyle(): string;
	h: number;
	isLookupTableVertical(): boolean;
	lookupPageDown(): void;
	lookupPageUp(): void;
	relative: boolean;
	scale: number;
	selectCandidate(arg: number): void;
	selectCandidateText(arg: string): void;

	showAux: boolean;

	showLookupTable: boolean;

	showPreedit: boolean;

	toggleIM(): void;

	triggerProperty(arg: string): void;

	w: number;

	x: number;

	y: number;
}
