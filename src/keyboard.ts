import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import St from "gi://St";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as KeyboardBase from "resource:///org/gnome/shell/ui/keyboard.js";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { Key } from "./types/oskLayout.js";
import type { IKimPanel } from "./types/kimpanel.js";

const KEY_LONG_PRESS_TIME = 250 as const;

const CustomKey = GObject.registerClass(
  {
    Signals: {
      "long-press": {},
      pressed: {},
      released: {},
      keyval: { param_types: [GObject.TYPE_UINT] },
      commit: { param_types: [GObject.TYPE_STRING] },
    },
  },
  class CustomKey extends St.BoxLayout {
    // begin-remove
    private _boxPointer!: BoxPointer.BoxPointer | null;
    private _capturedPress!: boolean;
    private _extendedKeys!: string[];
    private _extendedKeyboard!: St.BoxLayout | null;
    private _icon!: St.Icon;
    private _keyval!: number;
    private _pressTimeoutId!: number;
    private _pressed!: boolean;
    private _touchPressSlot!: number | null;
    public keyButton!: St.Button | null;
    // end-remove
    constructor(
      params: {
        label?: string;
        iconName?: string;
        commitString?: string;
        keyval?: number | string;
      },
      extendedKeys: string[] = []
    ) {
      const { label, iconName, commitString, keyval } = {
        keyval: 0,
        ...params,
      };
      super({ style_class: "key-container" });

      this._keyval =
        typeof keyval === "number" ? keyval : Number.parseInt(keyval, 16);
      this.keyButton = this._makeKey(commitString, label, iconName);

      /* Add the key in a container, so keys can be padded without losing
       * logical proportions between those.
       */
      this.add_child(this.keyButton);
      this.connect("destroy", this._onDestroy.bind(this));

      this._extendedKeys = extendedKeys;
      this._extendedKeyboard = null;
      this._pressTimeoutId = 0;
      this._capturedPress = false;
    }

    get iconName() {
      return this._icon.icon_name ?? "";
    }

    set iconName(value: string) {
      this._icon.icon_name = value;
    }

    _onDestroy() {
      if (this._boxPointer) {
        this._boxPointer?.destroy();
        this._boxPointer = null;
      }

      this.cancel();
    }

    _ensureExtendedKeysPopup() {
      if (this._extendedKeys.length === 0) return;

      if (this?._boxPointer) return;

      const _boxPointer = new BoxPointer.BoxPointer(St.Side.BOTTOM);
      this._boxPointer = _boxPointer;

      _boxPointer.hide();
      Main.layoutManager.addTopChrome(_boxPointer);
      if (this.keyButton) _boxPointer.setPosition(this.keyButton, 0.5);

      // Adds style to existing keyboard style to avoid repetition
      _boxPointer.add_style_class_name("keyboard-subkeys");
      this._getExtendedKeys();
      if (this.keyButton) this.keyButton._extendedKeys = this._extendedKeyboard;
    }

    _press(button: St.Button) {
      if (button === this.keyButton) {
        this._pressTimeoutId = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          KEY_LONG_PRESS_TIME,
          () => {
            this._pressTimeoutId = 0;

            this.emit("long-press");

            if (this._extendedKeys.length > 0) {
              this._touchPressSlot = null;
              this._ensureExtendedKeysPopup();
              this.keyButton?.set_hover(false);
              this.keyButton?.fake_release();
              this._showSubkeys();
            }

            return GLib.SOURCE_REMOVE;
          }
        );
      }

      this.emit("pressed");
      this._pressed = true;
    }

    _release(button: St.Button, commitString?: string) {
      if (this._pressTimeoutId !== 0) {
        GLib.source_remove(this._pressTimeoutId);
        this._pressTimeoutId = 0;
      }

      if (this._pressed) {
        if (this._keyval && button === this.keyButton)
          this.emit("keyval", this._keyval);
        else if (commitString) this.emit("commit", commitString);
        else console.error("Need keyval or commitString");
      }

      this.emit("released");
      this._hideSubkeys();
      this._pressed = false;
    }

    cancel() {
      if (this._pressTimeoutId !== 0) {
        GLib.source_remove(this._pressTimeoutId);
        this._pressTimeoutId = 0;
      }
      this._touchPressSlot = null;
      this.keyButton?.set_hover(false);
      this.keyButton?.fake_release();
    }

    _onCapturedEvent(actor: Clutter.Actor, event: Clutter.Event): boolean {
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
        (targetActor === this._boxPointer?.bin ||
          this._boxPointer?.bin.contains(targetActor))
      )
        return Clutter.EVENT_PROPAGATE;

      if (press) this._capturedPress = true;
      else if (release && this._capturedPress) this._hideSubkeys();

      return Clutter.EVENT_STOP;
    }

    _showSubkeys(): void {
      this._boxPointer?.open(BoxPointer.PopupAnimation.FULL);
      global.stage.connectObject(
        "captured-event",
        this._onCapturedEvent.bind(this),
        this
      );
      this.keyButton?.connectObject(
        "notify::mapped",
        () => {
          if (!this.keyButton || !this.keyButton.is_mapped())
            this._hideSubkeys();
        },
        this
      );
    }

    _hideSubkeys(): void {
      if (this._boxPointer)
        this._boxPointer?.close(BoxPointer.PopupAnimation.FULL);
      global.stage.disconnectObject(this);
      this.keyButton?.disconnectObject(this);
      this._capturedPress = false;
    }

    _makeKey(commitString?: string, label?: string, icon?: string): St.Button {
      const button = new St.Button({
        style_class: "keyboard-key",
        x_expand: true,
      });

      if (icon) {
        const child = new St.Icon({ icon_name: icon });
        button.set_child(child);
        this._icon = child;
      } else if (label) {
        button.set_label(label);
      } else if (commitString) {
        button.set_label(commitString);
      }

      button.connect("button-press-event", () => {
        this._press(button);
        button.add_style_pseudo_class("active");
        return Clutter.EVENT_STOP;
      });
      button.connect("button-release-event", () => {
        this._release(button, commitString);
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
          !this._touchPressSlot &&
          event.type() === Clutter.EventType.TOUCH_BEGIN
        ) {
          this._touchPressSlot = slot;
          this._press(button);
          button.add_style_pseudo_class("active");
        } else if (event.type() === Clutter.EventType.TOUCH_END) {
          if (!this._touchPressSlot || this._touchPressSlot === slot) {
            this._release(button, commitString);
            button.remove_style_pseudo_class("active");
          }

          if (this._touchPressSlot === slot) this._touchPressSlot = null;
        }
        return Clutter.EVENT_STOP;
      });

      return button;
    }

    _getExtendedKeys(): void {
      this._extendedKeyboard = new St.BoxLayout({
        style_class: "key-container",
        vertical: false,
      });

      for (let i = 0; i < this._extendedKeys.length; ++i) {
        const extendedKey = this._extendedKeys[i];
        const key = this._makeKey(extendedKey);

        key.extendedKey = extendedKey;
        this._extendedKeyboard?.add_child(key);

        if (this.keyButton) {
          const keyButton = this.keyButton;
          key.set_size(...keyButton.allocation.get_size());
          keyButton.connect("notify::allocation", () =>
            key.set_size(...keyButton.allocation.get_size())
          );
        }
      }
      const _extendedKeyboard = this._extendedKeyboard;

      if (_extendedKeyboard != null)
        this._boxPointer?.bin.add_child(_extendedKeyboard);
    }

    get subkeys() {
      return this._boxPointer;
    }

    setLatched(latched: boolean) {
      if (latched) this.keyButton?.add_style_pseudo_class("latched");
      else this.keyButton?.remove_style_pseudo_class("latched");
    }
  }
);

export const Keyboard = GObject.registerClass(
  class Keyboard extends GObject.Object {
    // begin-remove
    private _injectionManager: InjectionManager | null;
    private _kanaActive: boolean;
    private _toggleIMKeySet: Set<typeof CustomKey.prototype> | null;
    // end-remove

    constructor(
      private readonly kimpanel: IKimPanel,
      private readonly _dir: Gio.File
    ) {
      super();

      this._injectionManager = new InjectionManager();
      this._toggleIMKeySet = new Set();
      this._kanaActive = false;

      this._setupKeyboard();
    }

    destroy(): void {
      this._injectionManager?.clear();
      this._injectionManager = null;

      this._toggleIMKeySet = null;

      Main.layoutManager.removeChrome(Main.layoutManager.keyboardBox);

      const destroyed = this._destroyKeyboard();

      this._getModifiedLayouts()?._unregister();
      this._getDefaultLayouts()._register();

      if (destroyed) Main.keyboard._keyboard = new KeyboardBase.Keyboard();
      Main.layoutManager.addTopChrome(Main.layoutManager.keyboardBox);
    }

    setSuggestions(labels: string[], texts: string[]): void {
      Main.keyboard.resetSuggestions();

      for (let i = 0; i < labels.length; i++) {
        Main.keyboard.addSuggestion(texts[i], () => {
          this.kimpanel.selectCandidate(i);
          Main.keyboard.resetSuggestions();
        });
      }
    }

    updateProperty(value: string): void {
      if (this._toggleIMKeySet == null) return;

      /**
       * Supported IM
       * - fcitx-anthy
       * - fcitx-kkc
       * - fcitx-mozc
       * - fcitx-skk
       */
      const kanaActive =
        /^\/Fcitx\/im:(?:Anthy:fcitx-anthy:ひらがな|Mozc:fcitx-mozc:全角かな|SKK:fcitx_skk:ひらがな|かな漢字:fcitx_kkc:ひらがな)/.test(
          value
        );

      this._kanaActive = kanaActive;
      for (const button of this._toggleIMKeySet.values()) {
        button.setLatched(kanaActive);
      }

      return;
    }

    visible(): boolean {
      return Main.keyboard._keyboard?.visible ?? false;
    }

    _getModifiedLayouts(): Gio.Resource | null {
      const modifiedLayoutsPath = this._dir
        ?.get_child("data")
        .get_child("gnome-shell-osk-layouts.gresource")
        .get_path();

      return modifiedLayoutsPath == null
        ? null
        : Gio.Resource.load(modifiedLayoutsPath);
    }

    _getDefaultLayouts(): Gio.Resource {
      return Gio.Resource.load(
        "/usr/share/gnome-shell/gnome-shell-osk-layouts.gresource"
      );
    }

    _destroyKeyboard(): boolean {
      try {
        (Main.keyboard.keyboardActor as KeyboardBase.Keyboard).destroy();
        Main.keyboard._keyboard = null;
      } catch (e) {
        if (e instanceof TypeError) return false;

        throw e;
      }
      return true;
    }

    _overrideAddRowKeys(
      _originalMethod: typeof KeyboardBase.Keyboard.prototype._addRowKeys
    ): typeof KeyboardBase.Keyboard.prototype._addRowKeys {
      const _this = this;

      return function (
        this: KeyboardBase.Keyboard,
        keys: Key[],
        layout: KeyboardBase.KeyContainer,
        emojiVisible: boolean
      ) {
        let accumulatedWidth = 0;
        for (let i = 0; i < keys.length; ++i) {
          const key = keys[i];
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
              label: key.label,
              iconName: key.iconName,
              keyval: key.keyval,
            },
            strings
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
            if (key.action === "toggleIM") {
              if (_this._kanaActive) button.setLatched(_this._kanaActive);
              _this._toggleIMKeySet?.add(button);
            }

            button.connect("released", () => {
              if (key.action === "hide") {
                this.close(true);
              } else if (key.action === "languageMenu") {
                this._popupLanguageMenu(button);
              } else if (key.action === "emoji") {
                this._toggleEmoji();
              } else if (key.action === "modifier") {
                if (key.keyval) this._toggleModifier(key.keyval);
              } else if (key.action === "delete") {
                this._keyboardController.toggleDelete(true);
                this._keyboardController.toggleDelete(false);
              } else if (key.action === "toggleIM") {
                _this.kimpanel.toggleIM();
              } else if (!this._longPressed && key.action === "levelSwitch") {
                if (key.level) this._setActiveLevel(key.level);
                this._setLatched(
                  key.level === 1 &&
                    key.iconName === "keyboard-caps-lock-symbolic"
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
              this._keyboardController.toggleDelete(true)
            );
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

    _setupKeyboard() {
      Main.layoutManager.removeChrome(Main.layoutManager.keyboardBox);

      const destroyed = this._destroyKeyboard();

      this._getDefaultLayouts()._unregister();
      this._getModifiedLayouts()?._register();

      this._injectionManager?.overrideMethod(
        KeyboardBase.Keyboard.prototype,
        "_addRowKeys",
        this._overrideAddRowKeys.bind(this)
      );

      if (destroyed) Main.keyboard._keyboard = new KeyboardBase.Keyboard();

      Main.layoutManager.addTopChrome(Main.layoutManager.keyboardBox);
    }
  }
);
