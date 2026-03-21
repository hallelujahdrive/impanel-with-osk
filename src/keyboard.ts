import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";
import {
	gettext as _,
	InjectionManager,
} from "resource:///org/gnome/shell/extensions/extension.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as KeyboardBase from "resource:///org/gnome/shell/ui/keyboard.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as InputSourceManager from "resource:///org/gnome/shell/ui/status/keyboard.js";
import type { IKimPanel } from "./types/kimpanel.js";
import type { Key } from "./types/oskLayout.js";

interface KeyLike extends St.BoxLayout {
	keyButton: null | St.Button;
	setLatched(latched: boolean): void;
}

const KEY_LONG_PRESS_TIME = 250 as const;
type KeyLikeConstructor = new (
	params: {
		commitString?: string;
		iconName?: string;
		keyval?: number | string;
		label?: string;
	},
	extendedKeys?: string[],
) => KeyLike;

const AllSuggestions = GObject.registerClass(
	class AllSuggestions extends St.ScrollView {
		// begin-remove
		private boxLayout!: null | St.BoxLayout;
		private pressTimeoutId: number;
		// end-remove
		constructor(private readonly kimpanel: IKimPanel) {
			super({
				hscrollbarPolicy: St.PolicyType.NEVER,
				overlay_scrollbars: true,
				reactive: true,
				vscrollbarPolicy: St.PolicyType.AUTOMATIC,
				xExpand: true,
				yAlign: Clutter.ActorAlign.FILL,
				yExpand: true,
			});

			this.boxLayout = new St.BoxLayout({
				styleClass: "word-suggestions word-all-suggestions",
				vertical: true,
				xExpand: true,
				yExpand: false,
			});

			this.pressTimeoutId = 0;

			this.add_child(this.boxLayout);
		}

		public destroy(): void {
			if (this.boxLayout != null) this.remove_child(this.boxLayout);
			this.boxLayout = null;
			if (this.pressTimeoutId !== 0) GLib.Source.remove(this.pressTimeoutId);
			this.pressTimeoutId = 0;

			super.destroy();
		}

		public reset(): void {
			this.boxLayout?.remove_all_children();
			this.boxLayout?.set_height(-1);
			this.hide();
		}

		public set(texts: string[]): void {
			this.boxLayout?.remove_all_children();
			this.show();

			for (const text of texts) {
				const row = this.getRow();
				const button = new St.Button({
					label: text,
				});

				const callback = () => {
					this.kimpanel.selectCandidateText(text);

					Main.keyboard._keyboard?._aspectContainer?.show();
					this.hide();
				};

				button.connect("button-press-event", () => {
					this.buttonPress();
					return Clutter.EVENT_PROPAGATE;
				});

				button.connect("button-release-event", () => {
					this.buttonRelease(callback);
					return Clutter.EVENT_STOP;
				});

				button.connect("touch-event", (_actor, event: Clutter.Event) => {
					if (event.type() === Clutter.EventType.TOUCH_BEGIN) {
						this.buttonPress();
					} else if (event.type() === Clutter.EventType.TOUCH_END) {
						this.buttonRelease(callback);
					}

					return Clutter.EVENT_STOP;
				});

				const [_, naturalWidth] = button.get_preferred_width(-1);

				if (row.width + naturalWidth <= (Main.keyboard._keyboard?.width ?? 0)) {
					row.add_child(button);
				} else if (texts.at(-1) !== text) {
					// add a new row
					const newRow = new St.BoxLayout({ vertical: false });
					this.boxLayout?.add_child(newRow);
				}
			}
		}

		private buttonPress(): void {
			this.pressTimeoutId = GLib.timeout_add(
				GLib.PRIORITY_DEFAULT,
				KEY_LONG_PRESS_TIME,
				() => {
					this.pressTimeoutId = 0;
					return GLib.SOURCE_REMOVE;
				},
			);
		}

		private buttonRelease(callback: () => void): void {
			if (this.pressTimeoutId !== 0) {
				callback();
				GLib.source_remove(this.pressTimeoutId);
				this.pressTimeoutId = 0;
			}
		}

		private getRow(): Clutter.Actor {
			const row = this.boxLayout?.get_last_child();

			if (row != null) return row;

			const newRow = new St.BoxLayout({ vertical: false });

			this.boxLayout?.add_child(newRow);

			return newRow;
		}
	},
);

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

class LanguageSelectionPopup extends PopupMenu.PopupMenu {
	private capturedPress: boolean;
	private sourceMappedId: number;
	private stageCaptureEventId: number;

	constructor(sourceActor: Clutter.Actor) {
		super(sourceActor, 0.5, St.Side.BOTTOM);
		this.capturedPress = false;
		this.sourceMappedId = 0;
		this.stageCaptureEventId = 0;

		const inputSourceManager = InputSourceManager.getInputSourceManager();
		const inputSources = inputSourceManager.inputSources;

		let item: PopupMenu.PopupBaseMenuItem;
		for (const i in inputSources) {
			const is = inputSources[i];

			item = this.addAction(is.displayName, () => {
				inputSourceManager.activateInputSource(is, true);
			});
			item.can_focus = false;
			item.setOrnament(
				is === inputSourceManager.currentSource
					? PopupMenu.Ornament.DOT
					: PopupMenu.Ornament.NO_DOT,
			);
		}

		this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		item = this.addSettingsAction(
			_("Keyboard Settings"),
			"gnome-keyboard-panel.desktop",
		);
		item.can_focus = false;

		this.sourceMappedId = sourceActor.connect("notify::mapped", () => {
			if (!sourceActor.is_mapped()) this.close(BoxPointer.PopupAnimation.FULL);
		});
	}

	public _onCapturedEvent(_actor: Clutter.Actor, event: Clutter.Event) {
		const type = event.type();
		const press =
			type === Clutter.EventType.BUTTON_PRESS ||
			type === Clutter.EventType.TOUCH_BEGIN;
		const release =
			type === Clutter.EventType.BUTTON_RELEASE ||
			type === Clutter.EventType.TOUCH_END;
		const targetActor = global.stage.get_event_actor(event);

		if (
			targetActor &&
			(targetActor === this.actor || this.actor.contains(targetActor))
		)
			return Clutter.EVENT_PROPAGATE;

		if (press) this.capturedPress = true;
		else if (release && this.capturedPress) {
			this.close(BoxPointer.PopupAnimation.FULL);
		}
		return Clutter.EVENT_STOP;
	}

	public close(animate?: BoxPointer.PopupAnimation) {
		super.close(animate);
		this.capturedPress = false;
		if (this.stageCaptureEventId !== 0) {
			global.stage.disconnect(this.stageCaptureEventId);
			this.stageCaptureEventId = 0;
		}
	}

	public destroy() {
		if (this.stageCaptureEventId !== 0) {
			global.stage.disconnect(this.stageCaptureEventId);
			this.stageCaptureEventId = 0;
		}
		if (this.sourceMappedId !== 0) {
			this.sourceActor.disconnect(this.sourceMappedId);
			this.sourceMappedId = 0;
		}
		super.destroy();
	}

	public open(animate?: BoxPointer.PopupAnimation) {
		super.open(animate);
		if (this.stageCaptureEventId !== 0) {
			global.stage.disconnect(this.stageCaptureEventId);
		}
		this.stageCaptureEventId = global.stage.connect(
			"captured-event",
			this._onCapturedEvent.bind(this),
		);
	}
}

export const Keyboard = GObject.registerClass(
	class Keyboard extends GObject.Object {
		// begin-remove
		private allSuggestions: null | typeof AllSuggestions.prototype = null;
		private injectionManager: InjectionManager | null;
		private kanaActive: boolean;
		private keyConstructor: KeyLikeConstructor | null = null;
		private toggleIMKeySet: null | Set<KeyLike>;
		// end-remove
		constructor(
			private readonly kimpanel: IKimPanel,
			private readonly _dir: Gio.File,
		) {
			super();

			this.injectionManager = new InjectionManager();
			this.kanaActive = false;
			this.toggleIMKeySet = new Set();

			this.setupKeyboard();
		}

		public destroy(): void {
			this.injectionManager?.clear();
			this.injectionManager = null;

			this.toggleIMKeySet = null;

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
			Main.keyboard.resetSuggestions();
			// reset the width of the suggestions to auto-size
			Main.keyboard._keyboard?._suggestions?.set_width(-1);
			Main.keyboard._keyboard?._aspectContainer?.show();
			this.allSuggestions?.reset();

			const containerWidth = Main.keyboard._keyboard?.width ?? 0;

			// fill the suggestions with the texts
			for (const text of texts) {
				Main.keyboard.addSuggestion(text, () => {
					this.kimpanel.selectCandidateText(text);
				});

				const width = Main.keyboard._keyboard?._suggestions?.width ?? 0;
				if (width > containerWidth) {
					Main.keyboard._keyboard?._suggestions?.remove_child(
						Main.keyboard._keyboard._suggestions.lastChild,
					);
					break;
				}
			}

			const suggestionsCount =
				Main.keyboard._keyboard?._suggestions?.get_children().length ?? 0;

			// if all the texts fit in the suggestions, return
			if (suggestionsCount === texts.length) return;

			const suggestions = Main.keyboard._keyboard?._suggestions;

			// add a spacer to the suggestions
			suggestions?.add_child(new St.Widget({ x_expand: true }));

			const button = new ExpandButton();
			suggestions?.add_child(button);

			if (suggestions == null) return;

			// remove overflowed suggestions
			while (suggestions.width > containerWidth) {
				const key = suggestions.get_child_at_index(
					suggestions.get_children().length - 3,
				);
				if (key != null) {
					suggestions.remove_child(key);
				}
			}
			suggestions.set_width(containerWidth);

			const _suggestions = texts.slice(suggestions.get_children().length - 2);

			const callback = () => {
				if (Main.keyboard._keyboard?._aspectContainer?.visible) {
					Main.keyboard._keyboard?._aspectContainer?.hide();
					this.allSuggestions?.set(_suggestions);
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

			// suggestions.set_width(containerWidth);
			suggestions.set_x_align(Clutter.ActorAlign.START);
		}

		public updateProperty(value: string): void {
			if (this.toggleIMKeySet == null) return;

			/**
			 * Supported IM
			 * - fcitx-anthy
			 * - fcitx-kkc
			 * - fcitx-mozc
			 * - fcitx-skk
			 */
			const kanaActive =
				/^\/Fcitx\/im:(?:Anthy:fcitx-anthy:ひらがな|Mozc:fcitx-mozc:全角かな|Mozc:fcitx_mozc_hiragana:全角かな|SKK:fcitx_skk:ひらがな|かな漢字:fcitx_kkc:ひらがな)/.test(
					value,
				);

			this.kanaActive = kanaActive;
			for (const button of this.toggleIMKeySet.values()) {
				button.setLatched(kanaActive);
			}

			return;
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

		private overrideAddRowKeys(
			_originalMethod: typeof KeyboardBase.Keyboard.prototype._addRowKeys,
		): typeof KeyboardBase.Keyboard.prototype._addRowKeys {
			const _this = this;

			return function (
				this: KeyboardBase.Keyboard,
				keys: Key[],
				layout: KeyboardBase.KeyContainer,
				emojiVisible: boolean,
			) {
				// if the key constructor is null, call the original method
				if (_this.keyConstructor == null) {
					_originalMethod.call(this, [{ strings: [""] }], layout, emojiVisible);

					_this.keyConstructor = (layout.firstChild?.constructor ??
						null) as KeyLikeConstructor | null;

					layout.remove_all_children();
					layout._currentCol = 0;
					layout._maxCols = 0;
					layout.shiftKeys = [];
				}

				// Constructor type is not available in typings for the original key widget.
				if (_this.keyConstructor == null) {
					return;
				}

				let accumulatedWidth = 0;
				for (const key of keys) {
					const { strings } = key;
					const commitString = strings?.shift();

					if (key.action === "emoji" && !emojiVisible) {
						accumulatedWidth = key.width ?? 1;
						continue;
					}

					if (accumulatedWidth > 0) {
						// Pass accumulated width onto the next key
						key.width = (key.width ?? 1) + accumulatedWidth;
						accumulatedWidth = 0;
					}

					const button = new _this.keyConstructor(
						{
							commitString,
							iconName: key.iconName,
							keyval: key.keyval,
							label: key.label,
						},
						strings,
					);

					if (key.action) {
						button.connect("released", () => {
							if (key.action === "hide") {
								this.close(true);
								this._updateLevelFromHints(true);
							} else if (key.action === "languageMenu") {
								_this.kimpanel.toggleIM();
							} else if (key.action === "emoji") {
								this._toggleEmoji();
							} else if (key.action === "modifier") {
								if (key.keyval) this._toggleModifier(key.keyval);
							} else if (key.action === "delete") {
								this._keyboardController.toggleDelete(true);
								this._keyboardController.toggleDelete(false);
								this._updateLevelFromHints(true);
							} else if (!this._longPressed && key.action === "levelSwitch") {
								if (key.level) this._setActiveLevel(key.level);
								this._setLatched(
									key.level === 1 &&
										key.iconName === "keyboard-caps-lock-symbolic",
								);
							}

							this._longPressed = false;
						});
					} else if (key.keyval) {
						button.connect("keyval", (_actor: unknown, keyval: number) => {
							this._keyboardController.keyvalPress(keyval);
							this._keyboardController.keyvalRelease(keyval);
							this._updateLevelFromHints(true);
						});
					} else {
						button.connect("commit", (_actor: unknown, str: string) => {
							if (_this.kanaActive) {
								this._keyboardController.keyvalPress(str.charCodeAt(0));
								this._keyboardController.keyvalRelease(str.charCodeAt(0));
								this._disableAllModifiers();
								this._updateLevelFromHints(true);
							} else {
								this._keyboardController
									.commit(str, this._modifiers)
									.then(() => {
										this._disableAllModifiers();
										this._updateLevelFromHints(true);
									})
									.catch(console.error);
							}
						});
					}

					if (
						key.action === "levelSwitch" &&
						key.iconName === "keyboard-shift-symbolic"
					) {
						layout.shiftKeys?.push(button);
						if (key.level === "shift") {
							button.connect("long-press", () => {
								this._setActiveLevel(key.level);
								this._setLatched(true);
								this._longPressed = true;
							});
						}
					}

					if (key.action === "delete") {
						button.connect("long-press", () =>
							this._keyboardController.toggleDelete(true),
						);
					}

					if (key.action === "languageMenu") {
						button.connect("long-press", () => {
							if (button.keyButton) this._popupLanguageMenu(button.keyButton);
						});

						if (_this.kanaActive) button.setLatched(_this.kanaActive);
						_this.toggleIMKeySet?.add(button);
					}

					if (key.action === "modifier" && key.keyval) {
						const modifierKeys = this._modifierKeys[key.keyval] || [];
						modifierKeys.push(button);
						this._modifierKeys[key.keyval] = modifierKeys;
					}

					if (key.action || key.keyval)
						button.keyButton?.add_style_class_name("default-key");

					layout.appendKey(button, key.width, key.height, key.leftOffset);
				}
			};
		}

		private overridePopupLanguageMenu(
			_originalMethod: typeof KeyboardBase.Keyboard.prototype._popupLanguageMenu,
		): typeof KeyboardBase.Keyboard.prototype._popupLanguageMenu {
			return function (this: KeyboardBase.Keyboard, keyActor) {
				if (!(keyActor instanceof Clutter.Actor)) return;
				if (this.__kimpanelLanguagePopup)
					this.__kimpanelLanguagePopup.destroy();

				const popup = new LanguageSelectionPopup(keyActor);
				this.__kimpanelLanguagePopup = popup;
				Main.layoutManager.addTopChrome(popup.actor);
				popup.open(BoxPointer.PopupAnimation.FULL);
			};
		}

		private setupKeyboard(): void {
			Main.layoutManager.removeChrome(Main.layoutManager.keyboardBox);

			const destroyed = this.destroyKeyboard();

			this.getDefaultLayouts()._unregister();
			this.getModifiedLayouts()?._register();

			this.injectionManager?.overrideMethod(
				KeyboardBase.Keyboard.prototype,
				"_addRowKeys",
				this.overrideAddRowKeys.bind(this),
			);

			this.injectionManager?.overrideMethod(
				KeyboardBase.Keyboard.prototype,
				"_popupLanguageMenu",
				this.overridePopupLanguageMenu.bind(this),
			);

			if (destroyed) {
				Main.keyboard._keyboard = new KeyboardBase.Keyboard();

				this.allSuggestions = new AllSuggestions(this.kimpanel);

				Main.keyboard._keyboard.add_child(this.allSuggestions);

				this.allSuggestions.hide();
			}

			Main.layoutManager.addTopChrome(Main.layoutManager.keyboardBox);

			Main.keyboard._keyboard?._suggestions?.set_x_align(
				Clutter.ActorAlign.START,
			);

			if (Main.keyboard._keyboard?._keyboardController != null) {
				Main.keyboard._keyboard._keyboardController.oskCompletion = true;
			}
		}
	},
);
