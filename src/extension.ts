import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { CustomKeyboard } from "./keyboard.js";

export default class PlainExampleExtension extends Extension {
  private _keyboard: typeof CustomKeyboard.prototype | null = null;

  public enable() {
    if (this._keyboard) return;
    this._keyboard = new CustomKeyboard(this.dir);
  }

  public disable() {
    this._keyboard?.destroy();
    this._keyboard = null;
  }
}
