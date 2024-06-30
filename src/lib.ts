import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Pango from "gi://Pango";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import type { MenuItemProperty } from "./types/menuItem.js";

export const KimMenuItem = GObject.registerClass(
	class KimMenuItem extends PopupMenu.PopupBaseMenuItem {
		// begin-remove
		public key!: string;
		public label: St.Label;
		public menuItemActivateId!: number;
		public menuItemDestroyId!: number;

		private _icon: St.Icon;
		// end-remove
		constructor(
			text: string,
			iconName: string,
			params?: Partial<PopupMenu.PopupBaseMenuItem.ConstructorProps>,
		) {
			super(params);

			this.label = new St.Label({ text });
			this._icon = new St.Icon({
				style_class: "popup-menu-icon",
				x_align: Clutter.ActorAlign.END,
			});
			this.add_child(this._icon);
			this.add_child(this.label);

			this.setIcon(iconName);
		}

		setIcon(name: string): void {
			const icon = createIcon(name);
			if (icon != null) this._icon.gicon = icon;
		}
	},
);

export const parseProperty = (str: string): MenuItemProperty => {
	const p = str.split(":");
	const property = {
		hint: p.length > 4 && p[4].length > 0 ? p[4].split(",") : [],
		icon: p[2],
		key: p[0],
		label: p[1],
		text: p[3],
	};
	return property;
};

export const createIcon = (name: string): Gio.Icon | undefined => {
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
};

export const createMenuItem = (property: MenuItemProperty) => {
	const item = new KimMenuItem("", "");
	item.key = property.key;
	return item;
};

export const getTextStyle = (settings: Gio.Settings | null): string => {
	const fontString = settings?.get_string("font") || "Sans 11";
	const desc = Pango.FontDescription.from_string(fontString);

	const fontFamily = desc.get_family();
	const fontSize = `${desc.get_size() / Pango.SCALE}pt`;

	let fontStyle = "normal";
	for (const style in Pango.Style)
		if (Pango.Style[style as keyof typeof Pango.Style] === desc.get_style()) {
			fontStyle = style.toLowerCase();
			break;
		}

	let fontWeight = Pango.Weight.NORMAL;
	try {
		fontWeight = desc.get_weight();
	} catch (_error) {
		// pango_font_description_get_weight may return value does not match any enum.
		// ignore weight value if it happens.
	}

	return `font-family:'${fontFamily}';font-size:${fontSize};font-style:${fontStyle};font-weight:${fontWeight}`;
};

export const keyboardIsVisible = (): boolean => {
	return Main.keyboard._keyboard?.visible ?? false;
};

export const isLookupTableVertical = (
	settings: Gio.Settings | null,
): boolean => {
	return settings?.get_boolean("vertical") ?? false;
};

export const extractLabelString = (l: string): string => {
	if (l.length >= 2 && l.charCodeAt(0) < 127 && l.charCodeAt(1) < 127) {
		return l.substring(0, 2);
	}

	return l.substring(0, 1);
};
