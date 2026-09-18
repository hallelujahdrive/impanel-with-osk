import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Pango from "gi://Pango";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import type { MenuItemProperty } from "./types/menuItem.js";

class KimMenuItemClass extends PopupMenu.PopupBaseMenuItem {
	declare public key: string;
	declare public label: St.Label;
	declare public menuItemActivateId: number;
	declare public menuItemDestroyId: number;

	declare private _icon: St.Icon;

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
		if (icon != null && this._icon.gicon !== icon) this._icon.gicon = icon;
	}
}

export const KimMenuItem = GObject.registerClass(
	KimMenuItemClass,
) as unknown as typeof KimMenuItemClass;

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

const iconCache = new Map<string, Gio.Icon>();

export const createIcon = (name: string): Gio.Icon | undefined => {
	if (!name) return undefined;

	const cached = iconCache.get(name);
	if (cached != null) return cached;

	const icon =
		name[0] === "/"
			? Gio.FileIcon.new(Gio.File.new_for_path(name))
			: Gio.ThemedIcon.new_with_default_fallbacks(`${name}-symbolic-hack`);

	iconCache.set(name, icon);
	return icon;
};

export const applyPropertyToMenuItem = (
	item: typeof KimMenuItem.prototype,
	property: MenuItemProperty,
): void => {
	item.setIcon(property.icon);
	item.label.text = property.label;
};

export const bindPropertyMenuItem = (
	property: MenuItemProperty,
	onTrigger: (key: string) => void,
): typeof KimMenuItem.prototype => {
	const item = createMenuItem(property);
	item.menuItemActivateId = item.connect("activate", () => onTrigger(item.key));
	item.menuItemDestroyId = item.connect("destroy", () => {
		item.disconnect(item.menuItemActivateId);
		item.disconnect(item.menuItemDestroyId);
	});
	applyPropertyToMenuItem(item, property);
	return item;
};

export const createMenuItem = (property: MenuItemProperty) => {
	const item = new KimMenuItem("", "");
	item.key = property.key;
	return item;
};

export const getPanelTextStyle = (settings: Gio.Settings | null): string => {
	const fontString = settings?.get_string("panel-font") || "Sans 11";
	return getTextStyleHelper(fontString);
};

export const getOskSuggestionsTextStyle = (
	settings: Gio.Settings | null,
): string => {
	const fontString =
		settings?.get_string("osk-suggestions-font") || "Sans Bold 12";
	return getTextStyleHelper(fontString);
};

export const keyboardIsVisible = (): boolean => {
	return Main.keyboard._keyboard?.visible ?? false;
};

export const isLookupTableVertical = (
	settings: Gio.Settings | null,
): boolean => {
	return settings?.get_boolean("panel-vertical") ?? false;
};

export const extractLabelString = (label: string): string => {
	if (
		label.length >= 2 &&
		label.charCodeAt(0) < 127 &&
		label.charCodeAt(1) < 127
	) {
		return label.substring(0, 2);
	}

	return label.substring(0, 1);
};

const getTextStyleHelper = (fontString: string): string => {
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
