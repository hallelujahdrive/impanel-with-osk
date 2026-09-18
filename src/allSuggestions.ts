import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {
	actorNaturalWidth,
	BASE_PADDING,
	oskKeyboardContentWidth,
} from "./oskGeometry.js";
import type { IKimPanel } from "./types/kimpanel.js";

interface SuggestionButton extends St.Button {
	suggestionText: string;
}

/** If the vertical movement amount (px) exceeds this threshold on the candidate button, it is treated as a scroll (the tap is not confirmed). */
const SUGGESTION_SCROLL_DRAG_THRESHOLD_PX = 16 as const;

const sameStrings = (a: string[], b: string[]): boolean => {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
};

export const AllSuggestions = GObject.registerClass(
	class AllSuggestions extends St.ScrollView {
		declare private buttons: SuggestionButton[];
		declare private candidateContainer: null | St.BoxLayout;
		declare private keyboardBoxNotifyHeightId: number;
		declare private keyboardBoxNotifyWidthId: number;
		declare private kimpanel: IKimPanel;
		declare private lastScrollY: null | number;
		declare private panGesture: Clutter.PanGesture | null;
		declare private panUpdateId: number;
		declare private pressStartY: null | number;
		declare private relayoutSourceId: number;
		declare private rows: St.BoxLayout[];
		declare private scrollDragging: boolean;
		declare private texts: string[];

		constructor(kimpanel: IKimPanel) {
			super({
				hscrollbarPolicy: St.PolicyType.NEVER,
				reactive: true,
				vscrollbarPolicy: St.PolicyType.AUTOMATIC,
				xAlign: Clutter.ActorAlign.FILL,
				xExpand: true,
				y_expand: false,
			});

			this.kimpanel = kimpanel;
			this.lastScrollY = null;
			this.pressStartY = null;
			this.scrollDragging = false;
			this.panGesture = null;
			this.panUpdateId = 0;

			this.candidateContainer = new St.BoxLayout({
				style: this.kimpanel.getOskSuggestionsTextStyle(),
				styleClass: "word-suggestions word-all-suggestions",
				vertical: true,
				xAlign: Clutter.ActorAlign.FILL,
				xExpand: true,
				yExpand: true,
			});

			this.set_child(this.candidateContainer);

			this.buttons = [];
			this.rows = [];
			this.texts = [];
			this.relayoutSourceId = 0;

			this.keyboardBoxNotifyWidthId = Main.layoutManager.keyboardBox.connect(
				"notify::width",
				() => {
					this.syncLayoutFromKeyboard();
				},
			);

			this.keyboardBoxNotifyHeightId = Main.layoutManager.keyboardBox.connect(
				"notify::height",
				() => {
					this.syncLayoutFromKeyboard();
				},
			);

			this.panGesture = new Clutter.PanGesture();
			this.panGesture.set_pan_axis(Clutter.PanAxis.Y);
			this.panGesture.set_begin_threshold(10);

			this.panUpdateId = this.panGesture.connect(
				"pan-update",
				(action: Clutter.PanGesture) => {
					const delta = action.get_delta();
					const adjustment = this.get_vadjustment();
					adjustment.value -= delta.get_y();
				},
			);

			this.add_action(this.panGesture);
		}

		public destroy(): void {
			this.clearRelayoutSource();

			if (this.keyboardBoxNotifyWidthId !== 0) {
				Main.layoutManager.keyboardBox.disconnect(
					this.keyboardBoxNotifyWidthId,
				);
				this.keyboardBoxNotifyWidthId = 0;
			}
			if (this.keyboardBoxNotifyHeightId !== 0) {
				Main.layoutManager.keyboardBox.disconnect(
					this.keyboardBoxNotifyHeightId,
				);
				this.keyboardBoxNotifyHeightId = 0;
			}

			for (const button of this.buttons) {
				button.destroy();
			}
			this.buttons = [];
			for (const row of this.rows) {
				row.destroy();
			}
			this.rows = [];

			if (this.candidateContainer != null) {
				this.remove_child(this.candidateContainer);
				this.candidateContainer.destroy();
				this.candidateContainer = null;
			}
			this.resetSuggestionPointerState();

			if (this.panGesture != null) {
				this.panGesture.disconnect(this.panUpdateId);
				this.panUpdateId = 0;
				this.remove_action(this.panGesture);
				this.panGesture = null;
			}

			super.destroy();
		}

		public reset(): void {
			this.clearRelayoutSource();
			this.resetSuggestionPointerState();
			this.candidateContainer?.remove_all_children();
			for (const row of this.rows) {
				row.remove_all_children();
			}
			this.texts = [];
			this.hide();
		}

		public set(texts: string[]): void {
			this.show();
			const width = oskKeyboardContentWidth();
			const textsChanged = !sameStrings(this.texts, texts);
			if (textsChanged) this.texts = texts.slice();
			if (textsChanged || width < 1) {
				this.layoutSuggestionButtons(this.texts);
				if (width < 1) this.scheduleRelayout(this.texts);
			}
			this.syncLayoutFromKeyboard();
			this.get_parent()?.queue_relayout();
		}

		public updateFont(textStyle: string): void {
			this.candidateContainer?.set_style(textStyle);
		}

		private applyScrollStepFromY(y: number): void {
			if (this.lastScrollY == null) {
				this.lastScrollY = y;
				return;
			}
			const dy = y - this.lastScrollY;
			this.lastScrollY = y;
			const adjustment = this.get_vadjustment();
			adjustment.value -= dy;
		}

		private clearRelayoutSource(): void {
			if (this.relayoutSourceId === 0) return;
			GLib.source_remove(this.relayoutSourceId);
			this.relayoutSourceId = 0;
		}

		private createSuggestionButton(): SuggestionButton {
			const button = new St.Button() as SuggestionButton;
			button.suggestionText = "";

			button.connect("button-press-event", () => {
				this.suggestionButtonRelease(() => this.onSuggestionActivated(button));
				return Clutter.EVENT_STOP;
			});

			button.connect("motion-event", (_actor, event: Clutter.Event) => {
				if ((event.get_state() & Clutter.ModifierType.BUTTON1_MASK) === 0)
					return Clutter.EVENT_PROPAGATE;

				const [, y] = event.get_coords();
				if (this.scrollDragging) {
					this.applyScrollStepFromY(y);
					return Clutter.EVENT_STOP;
				}
				this.maybeStartScrollFromButton(y);
				return this.scrollDragging
					? Clutter.EVENT_STOP
					: Clutter.EVENT_PROPAGATE;
			});

			button.connect("touch-event", (_actor, event: Clutter.Event) => {
				const type = event.type();
				if (type === Clutter.EventType.TOUCH_BEGIN) {
					const [, y] = event.get_coords();
					this.suggestionPointerDown(y);
				} else if (type === Clutter.EventType.TOUCH_UPDATE) {
					const [, y] = event.get_coords();
					if (this.scrollDragging) this.applyScrollStepFromY(y);
					else this.maybeStartScrollFromButton(y);
				} else if (type === Clutter.EventType.TOUCH_END) {
					this.suggestionButtonRelease(() =>
						this.onSuggestionActivated(button),
					);
				} else if (type === Clutter.EventType.TOUCH_CANCEL) {
					this.resetSuggestionPointerState();
				}

				return Clutter.EVENT_STOP;
			});

			return button;
		}

		private ensureButton(index: number): SuggestionButton {
			let button = this.buttons[index];
			if (button == null) {
				button = this.createSuggestionButton();
				this.buttons[index] = button;
			}
			return button;
		}

		private ensureRow(index: number): St.BoxLayout {
			let row = this.rows[index];
			if (row == null) {
				row = new St.BoxLayout({
					vertical: false,
				});
				this.rows[index] = row;
			}
			return row;
		}

		private layoutSuggestionButtons(texts: string[]): void {
			const container = this.candidateContainer;
			if (container == null) return;

			container.remove_all_children();
			for (const row of this.rows) {
				row.remove_all_children();
			}

			const maxWidth = oskKeyboardContentWidth();
			let row = this.ensureRow(0);
			container.add_child(row);
			let rowIndex = 0;

			for (let i = 0; i < texts.length; i++) {
				const button = this.ensureButton(i);
				button.suggestionText = texts[i];
				button.label = texts[i];
				button.show();
				row.add_child(button);

				if (maxWidth > 1 && row.get_n_children() > 1) {
					if (actorNaturalWidth(row) > maxWidth) {
						row.remove_child(button);
						rowIndex++;
						row = this.ensureRow(rowIndex);
						container.add_child(row);
						row.add_child(button);
					}
				}
			}

			for (let i = texts.length; i < this.buttons.length; i++) {
				this.buttons[i].hide();
			}
		}

		private maybeStartScrollFromButton(y: number): void {
			if (this.pressStartY == null) return;
			if (Math.abs(y - this.pressStartY) < SUGGESTION_SCROLL_DRAG_THRESHOLD_PX)
				return;

			const totalDy = y - this.pressStartY;
			const adjustment = this.get_vadjustment();
			adjustment.value -= totalDy;
			this.scrollDragging = true;
			this.lastScrollY = y;
			this.pressStartY = null;
		}

		private onSuggestionActivated(button: SuggestionButton): void {
			this.kimpanel.selectCandidateText(button.suggestionText);

			Main.keyboard._keyboard?._aspectContainer?.show();
			this.reset();
		}

		private resetSuggestionPointerState(): void {
			this.pressStartY = null;
			this.scrollDragging = false;
			this.lastScrollY = null;
		}

		private scheduleRelayout(texts: string[]): void {
			this.clearRelayoutSource();

			this.relayoutSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
				this.relayoutSourceId = 0;
				if (!this.visible) return GLib.SOURCE_REMOVE;
				this.layoutSuggestionButtons(texts);
				this.syncLayoutFromKeyboard();
				this.get_parent()?.queue_relayout();
				return GLib.SOURCE_REMOVE;
			});
		}

		private suggestionButtonRelease(callback: () => void): void {
			if (!this.scrollDragging) callback();
			this.resetSuggestionPointerState();
		}

		private suggestionPointerDown(y: number): void {
			this.pressStartY = y;
			this.scrollDragging = false;
			this.lastScrollY = null;
		}

		private syncLayoutFromKeyboard(): void {
			const keyboard = Main.keyboard._keyboard;
			if (keyboard == null) return;

			const width = oskKeyboardContentWidth();
			if (width > 0 && this.width !== width) {
				this.set_width(width);
				this.candidateContainer?.set_width(width);
			}

			const suggestions = keyboard._suggestions;
			if (suggestions == null) return;

			const height = Math.max(
				1,
				keyboard.height - suggestions.height - BASE_PADDING * 2 * 2,
			);
			if (this.height !== height) {
				this.set_height(height);
				this.candidateContainer?.set_height(height);
			}
		}
	},
);
