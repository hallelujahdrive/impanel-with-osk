import GLib from "gi://GLib";
import type St from "gi://St";
import type { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as KeyboardBase from "resource:///org/gnome/shell/ui/keyboard.js";
import type { IKimPanel } from "./types/kimpanel.js";
import type { Key } from "./types/oskLayout.js";

interface KeyLike extends St.BoxLayout {
	_pressed: boolean;
	_repeatTimeoutId?: number;
	keyButton: null | St.Button;
	setLatched(latched: boolean): void;
}

type KeyLikeConstructor = new (
	params: {
		commitString?: string;
		iconName?: string;
		keyval?: number | string;
		label?: string;
	},
	extendedKeys?: string[],
) => KeyLike;

/**
 * Supported IM
 * - fcitx-anthy
 * - fcitx-kkc
 * - fcitx-mozc
 * - fcitx-skk
 */
const KANA_IM_PROPERTY =
	/^\/Fcitx\/im:(?:Anthy:fcitx-anthy:ひらがな|Mozc:fcitx-mozc:全角かな|Mozc:fcitx_mozc_hiragana:全角かな|SKK:fcitx_skk:ひらがな|かな漢字:fcitx_kkc:ひらがな)/;

const isKanaImActive = (property: string): boolean =>
	KANA_IM_PROPERTY.test(property);

/** OSK key construction, kana latch, and key-repeat. */
export class OskKeys {
	private kanaActive = false;
	private keyConstructor: KeyLikeConstructor | null = null;
	private repeatTimeoutIds: Set<number>;
	private toggleIMKeySet: null | Set<KeyLike>;

	constructor(private readonly kimpanel: IKimPanel) {
		this.repeatTimeoutIds = new Set();
		this.toggleIMKeySet = new Set();
	}

	public destroy(): void {
		this.clearKeyRepeats();
		this.toggleIMKeySet = null;
	}

	public install(injectionManager: InjectionManager): void {
		injectionManager.overrideMethod(
			KeyboardBase.Keyboard.prototype,
			"_addRowKeys",
			this.overrideAddRowKeys.bind(this),
		);
	}

	public updateProperty(value: string): void {
		if (this.toggleIMKeySet == null) return;

		this.kanaActive = isKanaImActive(value);
		for (const button of this.toggleIMKeySet.values()) {
			button.setLatched(this.kanaActive);
		}
	}

	private clearKeyRepeats(): void {
		for (const id of this.repeatTimeoutIds) {
			GLib.source_remove(id);
		}
		this.repeatTimeoutIds.clear();
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

				// delete
				if (key.keyval === "0xff08") {
					const keyval = parseInt(key.keyval, 16);

					button.connect("long-press", () => {
						_this.startKeyRepeat(button, () => {
							this._keyboardController.keyvalPress(keyval);
							this._keyboardController.keyvalRelease(keyval);
							this._updateLevelFromHints(true);
						});
					});
				}

				layout.appendKey(button, key.width, key.height, key.leftOffset);
			}
		};
	}

	private startKeyRepeat(button: KeyLike, onRepeat: () => void): void {
		this.stopKeyRepeat(button);

		const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
			if (!button._pressed) {
				this.repeatTimeoutIds.delete(id);
				button._repeatTimeoutId = 0;
				return GLib.SOURCE_REMOVE;
			}
			onRepeat();
			return GLib.SOURCE_CONTINUE;
		});
		button._repeatTimeoutId = id;
		this.repeatTimeoutIds.add(id);
	}

	private stopKeyRepeat(button: KeyLike): void {
		const id = button._repeatTimeoutId;
		if (id == null || id === 0) return;
		GLib.source_remove(id);
		this.repeatTimeoutIds.delete(id);
		button._repeatTimeoutId = 0;
	}
}
