import type GObject from "gi://GObject";

export interface IKimPanel extends GObject.Object {
	getOskSuggestionsTextStyle(): string;
	getPanelTextStyle(): string;
	isLookupTableVertical(): boolean;
	lookupPageDown(): void;
	lookupPageUp(): void;
	selectCandidate(arg?: number): void;
	selectCandidateText(arg: string): void;
	toggleIM(): void;
	triggerProperty(arg: string): void;
}

export type LookupController = Pick<
	IKimPanel,
	"lookupPageDown" | "lookupPageUp" | "selectCandidate"
>;
