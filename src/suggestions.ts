import { keyboardIsVisible } from "./lib.js";
import type { IKimPanel } from "./types/kimpanel.js";

type Status = "default" | "reset" | "search" | "searchReverse";

export class SuggestionsManager {
	public allTexts: string[];
	public cursor: number;
	public labels: string[];
	public layoutHint: number;
	public locked: boolean;
	public texts: string[];

	private candidate: string | null = null;
	private hasNext = false;
	private status: Status = "default";

	constructor(private readonly kimpanel: IKimPanel) {
		this.allTexts = [];
		this.cursor = -1;
		this.layoutHint = 0;
		this.labels = [];
		this.locked = false;
		this.texts = [];
	}

	public reset(): void {
		this.status = "default";
		this.candidate = null;

		this.allTexts = [];
		this.cursor = -1;
		this.layoutHint = 0;
		this.locked = false;
		this.labels = [];
		this.texts = [];
	}

	public selectCandidate(candidate: string): void {
		this.candidate = candidate;
		this.status = "search";

		this.selectCandidateHelp(this.texts);
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
		if (labels.length === 0 || labels.every((label) => label === "")) {
			this.reset();
		}

		this.hasNext = hasNext;

		this.cursor = cursor;
		this.layoutHint = layout;
		this.labels = labels;
		this.texts = texts;

		if (labels.length === 0) {
			return;
		}

		switch (this.status) {
			case "default": {
				if (this.locked) return;
				if (keyboardIsVisible()) {
					this.allTexts.push(...texts.map((text) => text.split("\n")[0]));
					if (hasNext) {
						this.kimpanel.lookupPageDown();
					} else {
						// reset cursor
						this.status = "reset";
						this.locked = true;
						this.kimpanel.lookupPageUp();
					}
				}
				return;
			}
			case "reset":
				if (hasPrev) {
					this.kimpanel.lookupPageUp();
				} else {
					this.status = "default";
				}
				return;
			case "search":
			case "searchReverse":
				this.selectCandidateHelp(texts);
				return;
		}
	}

	private selectCandidateHelp(texts: string[]): void {
		const index = texts.findIndex(
			(value) => value.split("\n")[0] === this.candidate,
		);

		if (index < 0) {
			if (!this.hasNext) {
				this.status = "searchReverse";
			}
			if (this.status === "searchReverse") {
				this.kimpanel.lookupPageUp();
			} else {
				this.kimpanel.lookupPageDown();
			}
		} else {
			this.kimpanel.selectCandidate(index);
			this.reset();
		}
	}
}
