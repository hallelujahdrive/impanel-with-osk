import type { LookupController } from "./types/kimpanel.js";

type LookupPage = {
	cursor: number;
	hasNext: boolean;
	hasPrev: boolean;
	labels: string[];
	layout: number;
	texts: string[];
};

type Status = "default" | "reset" | "search" | "searchReverse";

const isEmptyLabels = (labels: string[]): boolean =>
	labels.length === 0 || labels.every((label) => label === "");

const lookupItemText = (text: string): string => text.split("\n")[0];

export class SuggestionsManager {
	public allTexts: string[];
	public cursor: number;
	public labels: string[];
	public layoutHint: number;
	public texts: string[];

	private candidate: null | string = null;
	private collected = false;
	private hasNext = false;
	private hasPrev = false;
	private status: Status = "default";

	constructor(private readonly lookup: LookupController) {
		this.allTexts = [];
		this.cursor = -1;
		this.layoutHint = 0;
		this.labels = [];
		this.texts = [];
	}

	/** OSK path: collect/rewind/search. @returns true when suggestions should paint. */
	public advanceOsk(): boolean {
		if (this.labels.length === 0) return true;

		switch (this.status) {
			case "default":
				return this.collectPages();
			case "reset":
				return this.rewindPages();
			case "search":
			case "searchReverse":
				this.searchCandidate(this.texts);
				return false;
		}
	}

	public reset(): void {
		this.status = "default";
		this.candidate = null;

		this.allTexts = [];
		this.cursor = -1;
		this.layoutHint = 0;
		this.collected = false;
		this.labels = [];
		this.texts = [];
		this.hasNext = false;
		this.hasPrev = false;
	}

	public selectCandidate(candidate: string): void {
		this.candidate = candidate;
		this.status = "search";
		this.searchCandidate(this.texts);
	}

	public setLookupTable(
		labels: string[],
		texts: string[],
		_attrs: string[],
		hasPrev: boolean,
		hasNext: boolean,
		cursor: number,
		layout: number,
	): void {
		const page: LookupPage = {
			cursor,
			hasNext,
			hasPrev,
			labels,
			layout,
			texts,
		};

		if (isEmptyLabels(labels)) this.reset();
		this.applyPage(page);
	}

	private applyPage(page: LookupPage): void {
		this.hasNext = page.hasNext;
		this.hasPrev = page.hasPrev;
		this.cursor = page.cursor;
		this.layoutHint = page.layout;
		this.labels = page.labels;
		this.texts = page.texts;
	}

	private collectPages(): boolean {
		if (this.collected) return false;

		this.allTexts.push(...this.texts.map(lookupItemText));
		if (this.hasNext) {
			this.lookup.lookupPageDown();
			return false;
		}

		this.status = "reset";
		this.collected = true;
		this.lookup.lookupPageUp();
		return true;
	}

	private rewindPages(): boolean {
		if (this.hasPrev) this.lookup.lookupPageUp();
		else this.status = "default";
		return false;
	}

	private searchCandidate(texts: string[]): void {
		const index = texts.findIndex(
			(value) => lookupItemText(value) === this.candidate,
		);

		if (index >= 0) {
			this.lookup.selectCandidate(index);
			this.reset();
			return;
		}

		if (!this.hasNext) this.status = "searchReverse";
		if (this.status === "searchReverse") this.lookup.lookupPageUp();
		else this.lookup.lookupPageDown();
	}
}
