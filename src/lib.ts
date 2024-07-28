import Clutter from "gi://Clutter";
import St from "gi://St";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Pango from "gi://Pango";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import type { MenuItemProperty } from "./types/menuItem.js";

export const KimMenuItem = GObject.registerClass(
  class KimMenuItem extends PopupMenu.PopupBaseMenuItem {
    // begin-remove
    private _icon: St.Icon;

    public _key: string;
    public _menuItemActivateId: number;
    public _menuItemDestroyId: number;
    public label: St.Label;
    // end-remove
    constructor(
      text: string,
      iconName: string,
      params?: Partial<PopupMenu.PopupBaseMenuItem.ConstructorProps>
    ) {
      super(params);

      this.label = new St.Label({ text });
      this._icon = new St.Icon({
        x_align: Clutter.ActorAlign.END,
        style_class: "popup-menu-icon",
      });
      this.add_child(this._icon);
      this.add_child(this.label);

      this.setIcon(iconName);
    }

    setIcon(name: string): void {
      const icon = createIcon(name);
      if (icon != null) this._icon.gicon = icon;
    }
  }
);

export class SuggestionsManager {
  private _texts: string[];

  constructor(private readonly suggestion: string, texts: string[]) {
    this._texts = texts;
  }

  getSuggestIndex(): number {
    return this._texts.findIndex((text) => text === this.suggestion);
  }

  setTexts(texts: string[]): void {
    this._texts = texts;
  }
}

export function parseProperty(str: string): MenuItemProperty {
  const p = str.split(":");
  const property = {
    key: p[0],
    label: p[1],
    icon: p[2],
    text: p[3],
    hint: p.length > 4 && p[4].length > 0 ? p[4].split(",") : [],
  };
  return property;
}

export function createIcon(name: string): Gio.Icon | undefined {
  if (!name) return undefined;

  // biome-ignore lint/suspicious/noDoubleEquals: <explanation>
  if (name[0] == "/") {
    return Gio.FileIcon.new(Gio.File.new_for_path(name));
  }
  // this is to hack through the gtk silly icon theme code.
  // gtk doesn't want to mix symbolic icon and normal icon together,
  // while in our case, it's much better to show an icon instead of
  // hide everything.
  return Gio.ThemedIcon.new_with_default_fallbacks(`${name}-symbolic-hack`);
}

export function createMenuItem(property: MenuItemProperty) {
  const item = new KimMenuItem("", "");
  item._key = property.key;
  return item;
}

export function getTextStyle(settings: Gio.Settings | null) {
  const font_string = settings?.get_string("font") || "Sans 11";
  const desc = Pango.FontDescription.from_string(font_string);

  const font_family = desc.get_family();
  const font_size = `${desc.get_size() / Pango.SCALE}pt`;
  let font_style: string;
  for (const i in Pango.Style)
    if (Pango.Style[i] === desc.get_style()) font_style = i.toLowerCase();

  let font_weight = Pango.Weight.NORMAL;
  try {
    font_weight = desc.get_weight();
  } catch (error) {
    // pango_font_description_get_weight may return value does not match any enum.
    // ignore weight value if it happens.
  }

  return `font-family:'${font_family}';font-size:${font_size};font-style:${font_style};font-weight:${font_weight}`;
}

export function isLookupTableVertical(settings: Gio.Settings | null) {
  return settings?.get_boolean("vertical") || false;
}

export function extractLabelString(l: string) {
  if (l.length >= 2 && l.charCodeAt(0) < 127 && l.charCodeAt(1) < 127) {
    return l.substring(0, 2);
  }

  return l.substring(0, 1);
}
