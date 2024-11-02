import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import St from "gi://St";
import {
	InjectionManager,
	gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as KeyboardBase from "resource:///org/gnome/shell/ui/keyboard.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as InputSourceManager from "resource:///org/gnome/shell/ui/status/keyboard.js";
import type { IKimPanel } from "./types/kimpanel.js";
import type { Key } from "./types/oskLayout.js";

const KEY_LONG_PRESS_TIME = 250 as const;

const AllSuggestions = GObject.registerClass(
	class AllSuggestions extends St.ScrollView {
		// begin-remove
		private boxLayout!: St.BoxLayout | null;
		private gesture: Clutter.GestureAction | null;
		private pressTimeoutId: number;
		// end-remove
		constructor(private readonly kimpanel: IKimPanel) {
			super({
				hscrollbarPolicy: St.PolicyType.NEVER,
				overlay_scrollbars: true,
				reactive: true,
				vscrollbarPolicy: St.PolicyType.AUTOMATIC,
				xExpand: true,
				yExpand: true,
			});

			this.boxLayout = new St.BoxLayout({
				styleClass: "word-suggestions word-all-suggestions",
				vertical: true,
				xExpand: true,
				yExpand: true,
			});

			this.gesture = new Clutter.GestureAction();

			this.gesture.connect(
				"gesture-progress",
				(action: Clutter.GestureAction) => {
					const [, , dy] = action.get_motion_delta(0);
					const adjustment = this.get_vadjustment();
					adjustment.value -= dy;

					return Clutter.EVENT_STOP;
				},
			);

			this.pressTimeoutId = 0;

			this.add_child(this.boxLayout);
			this.add_action(this.gesture);
		}

		public destroy(): void {
			if (this.boxLayout != null) this.remove_child(this.boxLayout);
			this.boxLayout = null;
			if (this.gesture != null) this.remove_action(this.gesture);
			this.gesture = null;
			if (this.pressTimeoutId !== 0) GLib.Source.remove(this.pressTimeoutId);
			this.pressTimeoutId = 0;

			super.destroy();
		}

		public reset(): void {
			this.boxLayout?.remove_all_children();
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

				row.add_child(button);

				if (row.width > (Main.keyboard._keyboard?.width ?? 0)) {
					row.remove_child(button);

					const newRow = new St.BoxLayout({ vertical: false });
					newRow.add_child(button);
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

const CustomKey = GObject.registerClass(
	{
		Signals: {
			commit: { param_types: [GObject.TYPE_STRING] },
			keyval: { param_types: [GObject.TYPE_UINT] },
			"long-press": {},
			pressed: {},
			released: {},
		},
	},
	class CustomKey extends St.BoxLayout {
		// begin-remove
		public capturedPress!: boolean;
		public keyButton!: St.Button | null;

		private boxPointer!: BoxPointer.BoxPointer | null;
		private extendedKeyboard!: St.BoxLayout | null;
		private extendedKeys!: string[];
		private icon!: St.Icon;
		private keyval!: number;
		private pressTimeoutId!: number;
		private pressed!: boolean;
		private touchPressSlot!: number | null;
		// end-remove
		constructor(
			params: {
				commitString?: string;
				iconName?: string;
				keyval?: number | string;
				label?: string;
			},
			extendedKeys: string[] = [],
		) {
			const { label, iconName, commitString, keyval } = {
				keyval: 0,
				...params,
			};
			super({ style_class: "key-container" });

			this.keyval =
				typeof keyval === "number" ? keyval : Number.parseInt(keyval, 16);
			this.keyButton = this.makeKey(commitString, label, iconName);

			/* Add the key in a container, so keys can be padded without losing
			 * logical proportions between those.
			 */
			this.add_child(this.keyButton);
			this.connect("destroy", this.onDestroy.bind(this));

			this.extendedKeys = extendedKeys;
			this.extendedKeyboard = null;
			this.pressTimeoutId = 0;
			this.capturedPress = false;
		}

		get iconName() {
			return this.icon.icon_name ?? "";
		}

		get subkeys() {
			return this.boxPointer;
		}

		set iconName(value: string) {
			this.icon.icon_name = value;
		}

		public setLatched(latched: boolean) {
			if (latched) this.keyButton?.add_style_pseudo_class("latched");
			else this.keyButton?.remove_style_pseudo_class("latched");
		}

		private cancel(): void {
			if (this.pressTimeoutId !== 0) {
				GLib.source_remove(this.pressTimeoutId);
				this.pressTimeoutId = 0;
			}
			this.touchPressSlot = null;
			this.keyButton?.set_hover(false);
			this.keyButton?.fake_release();
		}

		private ensureExtendedKeysPopup(): void {
			if (this.extendedKeys.length === 0) return;

			if (this?.boxPointer) return;

			const _boxPointer = new BoxPointer.BoxPointer(St.Side.BOTTOM);
			this.boxPointer = _boxPointer;

			_boxPointer.hide();
			Main.layoutManager.addTopChrome(_boxPointer);
			if (this.keyButton) _boxPointer.setPosition(this.keyButton, 0.5);

			// Adds style to existing keyboard style to avoid repetition
			_boxPointer.add_style_class_name("keyboard-subkeys");
			this.getExtendedKeys();
			if (this.keyButton) this.keyButton._extendedKeys = this.extendedKeyboard;
		}

		private getExtendedKeys(): void {
			this.extendedKeyboard = new St.BoxLayout({
				style_class: "key-container",
				vertical: false,
			});

			for (const extendedKey of this.extendedKeys) {
				const key = this.makeKey(extendedKey);

				key.extendedKey = extendedKey;
				this.extendedKeyboard?.add_child(key);

				if (this.keyButton) {
					const keyButton = this.keyButton;
					key.set_size(...keyButton.allocation.get_size());
					keyButton.connect("notify::allocation", () =>
						key.set_size(...keyButton.allocation.get_size()),
					);
				}
			}
			const _extendedKeyboard = this.extendedKeyboard;

			if (_extendedKeyboard != null)
				this.boxPointer?.bin.add_child(_extendedKeyboard);
		}

		private hideSubkeys(): void {
			if (this.boxPointer)
				this.boxPointer?.close(BoxPointer.PopupAnimation.FULL);

			this.keyButton?.remove_style_class_name("active");

			global.stage.disconnectObject(this);
			this.keyButton?.disconnectObject(this);
			this.capturedPress = false;
		}

		private makeKey(
			commitString?: string,
			label?: string,
			icon?: string,
		): St.Button {
			const button = new St.Button({
				style_class: "keyboard-key",
				x_expand: true,
			});

			if (icon) {
				const child = new St.Icon({ icon_name: icon });
				button.set_child(child);
				this.icon = child;
			} else if (label) {
				button.set_label(label);
			} else if (commitString) {
				button.set_label(commitString);
			}

			button.connect("button-press-event", () => {
				this.press(button);
				button.add_style_pseudo_class("active");
				return Clutter.EVENT_STOP;
			});
			button.connect("button-release-event", () => {
				this.release(button, commitString);
				button.remove_style_pseudo_class("active");
				return Clutter.EVENT_STOP;
			});
			button.connect("touch-event", (_actor, event: Clutter.Event) => {
				// We only handle touch events here on wayland. On X11
				// we do get emulated pointer events, which already works
				// for single-touch cases. Besides, the X11 passive touch grab
				// set up by Mutter will make us see first the touch events
				// and later the pointer events, so it will look like two
				// unrelated series of events, we want to avoid double handling
				// in these cases.
				if (!Meta.is_wayland_compositor()) return Clutter.EVENT_PROPAGATE;

				const slot = event.get_event_sequence().get_slot();

				if (
					!this.touchPressSlot &&
					event.type() === Clutter.EventType.TOUCH_BEGIN
				) {
					this.touchPressSlot = slot;
					this.press(button);
					button.add_style_pseudo_class("active");
				} else if (event.type() === Clutter.EventType.TOUCH_END) {
					if (!this.touchPressSlot || this.touchPressSlot === slot) {
						this.release(button, commitString);
						button.remove_style_pseudo_class("active");
					}

					if (this.touchPressSlot === slot) this.touchPressSlot = null;
				}
				return Clutter.EVENT_STOP;
			});

			return button;
		}

		private onCapturedEvent(
			_actor: Clutter.Actor,
			event: Clutter.Event,
		): boolean {
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
				(targetActor === this.boxPointer?.bin ||
					this.boxPointer?.bin.contains(targetActor))
			)
				return Clutter.EVENT_PROPAGATE;

			if (press) this.capturedPress = true;
			else if (release && this.capturedPress) {
				this.hideSubkeys();
			}
			return Clutter.EVENT_STOP;
		}

		private onDestroy(): void {
			if (this.boxPointer) {
				this.boxPointer?.destroy();
				this.boxPointer = null;
			}

			this.cancel();
		}

		private press(button: St.Button): void {
			if (button === this.keyButton) {
				this.pressTimeoutId = GLib.timeout_add(
					GLib.PRIORITY_DEFAULT,
					KEY_LONG_PRESS_TIME,
					() => {
						this.pressTimeoutId = 0;

						this.emit("long-press");

						if (this.extendedKeys.length > 0) {
							this.touchPressSlot = null;
							this.ensureExtendedKeysPopup();
							this.keyButton?.set_hover(false);
							this.keyButton?.fake_release();
							this.showSubkeys();
						}

						return GLib.SOURCE_REMOVE;
					},
				);
			}

			this.emit("pressed");
			this.pressed = true;
		}

		private release(button: St.Button, commitString?: string): void {
			if (this.pressTimeoutId !== 0) {
				GLib.source_remove(this.pressTimeoutId);
				this.pressTimeoutId = 0;
			}

			if (this.pressed) {
				if (this.keyval && button === this.keyButton)
					this.emit("keyval", this.keyval);
				else if (commitString) this.emit("commit", commitString);
				else console.error("Need keyval or commitString");
			}

			this.emit("released");
			this.hideSubkeys();
			this.pressed = false;
		}

		private showSubkeys(): void {
			this.boxPointer?.open(BoxPointer.PopupAnimation.FULL);
			global.stage.connectObject(
				"captured-event",
				this.onCapturedEvent.bind(this),
				this,
			);
			this.keyButton?.connectObject(
				"notify::mapped",
				() => {
					if (!this.keyButton || !this.keyButton.is_mapped())
						this.hideSubkeys();
				},
				this,
			);
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
	declare sourceActor: typeof CustomKey.prototype;

	constructor(sourceActor: typeof CustomKey.prototype) {
		super(sourceActor, 0.5, St.Side.BOTTOM);

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

		sourceActor.connectObject(
			"notify::mapped",
			() => {
				if (!sourceActor.is_mapped()) this.close(true);
			},
			this,
		);
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

		if (press) this.sourceActor.capturedPress = true;
		else if (release && this.sourceActor.capturedPress) {
			this.close(true);
		}
		return Clutter.EVENT_STOP;
	}

	public close(animate: boolean) {
		super.close(animate);
		this.sourceActor.capturedPress = false;
		global.stage.disconnectObject(this);
	}

	public destroy() {
		global.stage.disconnectObject(this);
		this.sourceActor.disconnectObject(this);
		super.destroy();
	}

	public open(animate: boolean) {
		super.open(animate);
		global.stage.connectObject(
			"captured-event",
			this._onCapturedEvent.bind(this),
			this,
		);
	}
}

export const Keyboard = GObject.registerClass(
	class Keyboard extends GObject.Object {
		// begin-remove
		private allSuggestions: typeof AllSuggestions.prototype | null = null;
		private injectionManager: InjectionManager | null;
		private kanaActive: boolean;
		private toggleIMKeySet: Set<typeof CustomKey.prototype> | null;
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
			Main.keyboard._keyboard?._suggestions?.set_width(-1);
			Main.keyboard._keyboard?._aspectContainer?.show();
			this.allSuggestions?.reset();

			const containerWidth = Main.keyboard._keyboard?.width ?? 0;

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

			if (suggestionsCount === texts.length) return;

			const button = new ExpandButton();

			const spacer = new St.Widget({ x_expand: true });
			Main.keyboard._keyboard?._suggestions?.add_child(spacer);
			Main.keyboard._keyboard?._suggestions?.add_child(button);

			if (Main.keyboard._keyboard?._suggestions == null) return;

			while (Main.keyboard._keyboard._suggestions.width > containerWidth) {
				const key = Main.keyboard._keyboard._suggestions.get_child_at_index(
					Main.keyboard._keyboard._suggestions.get_children().length - 3,
				);
				if (key != null) {
					Main.keyboard._keyboard?._suggestions.remove_child(key);
				}
			}

			const _suggestions = texts.slice(
				Main.keyboard._keyboard._suggestions.get_children().length - 2,
			);

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

			Main.keyboard._keyboard._suggestions.set_width(containerWidth);
			Main.keyboard._keyboard._suggestions.set_x_align(
				Clutter.ActorAlign.START,
			);
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

					const button = new CustomKey(
						{
							commitString,
							iconName: key.iconName,
							keyval: key.keyval,
							label: key.label,
						},
						strings,
					);

					if (key.keyval) {
						button.connect("keyval", (_actor, keyval) => {
							this._keyboardController.keyvalPress(keyval);
							this._keyboardController.keyvalRelease(keyval);
						});
					}

					if (key.action !== "modifier") {
						button.connect("commit", (_actor, str) => {
							this._keyboardController
								.commit(str, this._modifiers)
								.then(() => {
									this._disableAllModifiers();
									if (
										layout.mode === "default" ||
										(layout.mode === "latched" && !this._latched)
									) {
										if (this._contentHint !== 0) this._updateLevelFromHints();
										else this._setActiveLevel("default");
									}
								})
								.catch(console.error);
						});
					}

					if (key.action != null) {
						button.connect("released", () => {
							if (key.action === "hide") {
								this.close(true);
							} else if (key.action === "languageMenu") {
								_this.kimpanel.toggleIM();
							} else if (key.action === "emoji") {
								this._toggleEmoji();
							} else if (key.action === "modifier") {
								if (key.keyval) this._toggleModifier(key.keyval);
							} else if (key.action === "delete") {
								this._keyboardController.toggleDelete(true);
								this._keyboardController.toggleDelete(false);
							} else if (!this._longPressed && key.action === "levelSwitch") {
								if (key.level) this._setActiveLevel(key.level);
								this._setLatched(
									key.level === 1 &&
										key.iconName === "keyboard-caps-lock-symbolic",
								);
							}

							this._longPressed = false;
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
							this._popupLanguageMenu(button);
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
			return function (
				this: KeyboardBase.Keyboard,
				keyActor: typeof CustomKey.prototype,
			) {
				if (this._languagePopup) this._languagePopup.destroy();

				this._languagePopup = new LanguageSelectionPopup(keyActor);
				Main.layoutManager.addTopChrome(this._languagePopup.actor);
				this._languagePopup.open(true);
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
		}
	},
);
