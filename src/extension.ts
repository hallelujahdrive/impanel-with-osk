import type Gio from "gi://Gio";
import {
  Extension,
  type ExtensionMetadata,
} from "resource:///org/gnome/shell/extensions/extension.js";
// import type { CustomKeyboard } from "./keyboard.js";
import { Kimpanel } from "./kimpanel.js";

import "./stylesheet.css";

export default class PlainExampleExtension extends Extension {
  // private _keyboard: typeof CustomKeyboard.prototype | null = null;
  private _kimpanel: typeof Kimpanel.prototype | null = null;
  private _settings: Gio.Settings;

  constructor(metadata: ExtensionMetadata) {
    super(metadata);

    this._settings = this.getSettings();
  }

  public enable() {
    // if (!this._keyboard);
    // this._keyboard = new CustomKeyboard(this.dir);
    if (this._kimpanel) return;
    this._kimpanel = new Kimpanel(this._settings, this.dir);
  }

  public disable() {
    // this._keyboard?.destroy();
    // this._keyboard = null;
    this._kimpanel?.destroy();
    this._kimpanel = null;
  }
}
