import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import St from "gi://St";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as KeyboardBase from "resource:///org/gnome/shell/ui/keyboard.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { AllSuggestions } from "./allSuggestions.js";
import { overridePopupLanguageMenu } from "./languagePopup.js";
import { actorNaturalWidth, oskKeyboardContentWidth } from "./oskGeometry.js";
import { OskKeys } from "./oskKeys.js";
import type { IKimPanel } from "./types/kimpanel.js";

const ExpandButton = GObject.registerClass(
	class ExpandButton extends St.Button {
		constructor() {
			super({
				iconName: "pan-down-symbolic",
				styleClass: "kimpanel-suggestions-expand",
			});
		}

		public expand(expanded: boolean): void {
			this.iconName = expanded ? "pan-up-symbolic" : "pan-down-symbolic";
		}
	},
);

export const Keyboard = GObject.registerClass(
	class Keyboard extends GObject.Object {
		declare private _dir: Gio.File;
		declare private allSuggestions: null | typeof AllSuggestions.prototype;
		declare private injectionManager: InjectionManager | null;
		declare private kimpanel: IKimPanel;
		declare private oskKeys: null | OskKeys;

		constructor(kimpanel: IKimPanel, dir: Gio.File) {
			super();

			this.kimpanel = kimpanel;
			this._dir = dir;
			this.allSuggestions = null;
			this.injectionManager = new InjectionManager();
			this.oskKeys = new OskKeys(this.kimpanel);
			this.setupKeyboard();
		}

		public destroy(): void {
			this.oskKeys?.destroy();
			this.oskKeys = null;
			this.injectionManager?.clear();
			this.injectionManager = null;

			Main.layoutManager.removeChrome(Main.layoutManager.keyboardBox);

			const destroyed = this.destroyKeyboard();

			this.getModifiedLayouts()?._unregister();
			this.getDefaultLayouts()._register();

			if (destroyed) {
				this.allSuggestions?.destroy();
				this.allSuggestions = null;
				Main.keyboard._keyboard = new KeyboardBase.Keyboard();
			}

			Main.layoutManager.addTopChrome(Main.layoutManager.keyboardBox);
		}

		public setSuggestions(texts: string[]): void {
			this.ensureOskKeyboardPatched();
			Main.keyboard.resetSuggestions();

			const suggestions = Main.keyboard._keyboard?._suggestions;
			suggestions?.set_width(-1);
			Main.keyboard._keyboard?._aspectContainer?.show();
			this.allSuggestions?.reset();

			let containerWidth = oskKeyboardContentWidth();
			if (containerWidth < 1)
				containerWidth = Math.max(Main.layoutManager.keyboardBox.width, 1);

			for (const text of texts) {
				Main.keyboard.addSuggestion(text, () => {
					this.kimpanel.selectCandidateText(text);
				});

				if (
					suggestions != null &&
					actorNaturalWidth(suggestions) > containerWidth
				) {
					const lastChild = suggestions.lastChild;
					if (lastChild != null) suggestions.remove_child(lastChild);
					break;
				}
			}

			if (suggestions == null) return;

			if (suggestions.get_n_children() === texts.length) {
				suggestions.set_width(containerWidth);
				return;
			}

			suggestions.add_child(new St.Widget({ x_expand: true }));

			const button = new ExpandButton();
			suggestions.add_child(button);

			while (suggestions.get_n_children() > 2) {
				if (actorNaturalWidth(suggestions) <= containerWidth) break;
				const key = suggestions.get_child_at_index(
					suggestions.get_n_children() - 3,
				);
				if (key == null) break;
				suggestions.remove_child(key);
			}

			suggestions.set_width(containerWidth);

			const overflowTexts = texts.slice(suggestions.get_n_children() - 2);

			const callback = () => {
				if (
					Main.keyboard._keyboard?._aspectContainer == null ||
					this.allSuggestions == null
				)
					return;

				if (Main.keyboard._keyboard?._aspectContainer?.visible) {
					Main.keyboard._keyboard?._aspectContainer?.hide();
					this.allSuggestions?.set(overflowTexts);
					button.expand(true);
				} else {
					Main.keyboard._keyboard?._aspectContainer?.show();
					this.allSuggestions?.reset();
					button.expand(false);
				}
			};

			button.connect("button-press-event", () => {
				callback();
				return Clutter.EVENT_STOP;
			});

			button.connect("touch-event", (_actor, event) => {
				if (event.type() !== Clutter.EventType.TOUCH_BEGIN)
					return Clutter.EVENT_PROPAGATE;

				callback();
				return Clutter.EVENT_STOP;
			});

			suggestions.set_x_align(Clutter.ActorAlign.START);
		}

		public updateFont(textStyle: string): void {
			Main.keyboard._keyboard?._suggestions?.set_style(textStyle);
			this.allSuggestions?.updateFont(textStyle);
		}

		public updateProperty(value: string): void {
			this.oskKeys?.updateProperty(value);
		}

		private destroyKeyboard(): boolean {
			try {
				(
					Main.keyboard.keyboardActor as KeyboardBase.Keyboard | null
				)?.destroy();
				Main.keyboard._keyboard = null;
			} catch (e) {
				if (e instanceof TypeError) return false;

				throw e;
			}
			return true;
		}

		private ensureAllSuggestionsAttached(): boolean {
			if (this.allSuggestions == null) return false;

			try {
				return this.allSuggestions.get_parent() === Main.keyboard._keyboard;
			} catch {
				return false;
			}
		}

		/**
		 * Ensure the OSK keyboard is patched.
		 */
		private ensureOskKeyboardPatched(): void {
			if (Main.keyboard._keyboard == null) return;

			if (Main.keyboard._keyboard._keyboardController != null) {
				Main.keyboard._keyboard._keyboardController.oskCompletion = true;
			}
			Main.keyboard._keyboard._suggestions?.set_x_align(
				Clutter.ActorAlign.START,
			);

			if (this.ensureAllSuggestionsAttached()) return;

			if (this.allSuggestions != null) {
				try {
					this.allSuggestions.destroy();
				} catch {
					/* GObject が既に破棄済み */
				}
				this.allSuggestions = null;
			}

			this.allSuggestions = new AllSuggestions(this.kimpanel);
			Main.keyboard._keyboard.insert_child_at_index(this.allSuggestions, 1);
			this.allSuggestions.hide();
			Main.keyboard._keyboard.queue_relayout();
			Main.layoutManager.keyboardBox.queue_relayout();
		}

		private getDefaultLayouts(): Gio.Resource {
			return Gio.Resource.load(
				"/usr/share/gnome-shell/gnome-shell-osk-layouts.gresource",
			);
		}

		private getModifiedLayouts(): Gio.Resource | null {
			const modifiedLayoutsPath = this._dir
				?.get_child("data")
				.get_child("gnome-shell-osk-layouts.gresource")
				.get_path();

			return modifiedLayoutsPath == null
				? null
				: Gio.Resource.load(modifiedLayoutsPath);
		}

		private setupKeyboard(): void {
			Main.layoutManager.removeChrome(Main.layoutManager.keyboardBox);

			const destroyed = this.destroyKeyboard();

			this.getDefaultLayouts()._unregister();
			this.getModifiedLayouts()?._register();

			if (this.injectionManager != null)
				this.oskKeys?.install(this.injectionManager);

			this.injectionManager?.overrideMethod(
				KeyboardBase.Keyboard.prototype,
				"_popupLanguageMenu",
				overridePopupLanguageMenu,
			);

			if (destroyed) {
				Main.keyboard._keyboard = new KeyboardBase.Keyboard();
			}

			Main.keyboard._keyboard?._suggestions?.set_style(
				this.kimpanel.getOskSuggestionsTextStyle(),
			);

			this.ensureOskKeyboardPatched();

			Main.layoutManager.addTopChrome(Main.layoutManager.keyboardBox);
		}
	},
);
