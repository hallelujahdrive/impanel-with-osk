import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Pango from "gi://Pango";
import St from "gi://St";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Params from "resource:///org/gnome/shell/misc/params.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import {
	type KimMenuItem,
	createIcon,
	createMenuItem,
	extractLabelString,
	parseProperty,
} from "./lib.js";
import type { IKimPanel } from "./types/kimpanel.js";
import type { MenuItemProperty } from "./types/menuItem.js";

export const KimIndicator = GObject.registerClass(
	class KimIndicator extends PanelMenu.Button {
		// begin-remove
		public kimpanel: IKimPanel | null;
		public labelIcon: St.Label;
		public mainIcon: St.Icon;

		private properties: Record<string, MenuItemProperty>;
		private propertySwitch: Record<string, typeof KimMenuItem.prototype>;
		// end-remove
		constructor(params: { kimpanel: IKimPanel }) {
			super(0.5, "kimpanel");
			const _params = Params.parse(params, { kimpanel: null });
			this.properties = {};
			this.propertySwitch = {};

			const hbox = new St.BoxLayout({ style_class: "panel-status-menu-box" });
			this.labelIcon = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
			this.labelIcon.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
			this.labelIcon.clutter_text.line_wrap = false;
			this.mainIcon = new St.Icon({
				gicon: createIcon("input-keyboard"),
				style_class: "system-status-icon",
			});
			hbox.add_child(this.labelIcon);
			hbox.add_child(this.mainIcon);
			this.add_child(hbox);
			this.deactive();

			this.kimpanel = _params.kimpanel;

			const settingMenu = new PopupMenu.PopupMenuItem(_("Settings"));
			settingMenu.connect("activate", () => this.kimpanel?.emit("Configure"));
			const reloadMenu = new PopupMenu.PopupMenuItem(_("Reload Configuration"));
			reloadMenu.connect("activate", () => this.kimpanel?.emit("ReloadConfig"));

			if ("addMenuItem" in this.menu) {
				this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
				this.menu.addMenuItem(reloadMenu);
				this.menu.addMenuItem(settingMenu);
			}
			this.hide();
		}

		public active(): void {
			if (this.properties["/Fcitx/im"]) {
				this.setIcon(this.properties["/Fcitx/im"]);
			} else {
				this.deactive();
			}
		}

		public deactive(): void {
			const property = {
				hint: [],
				icon: "input-keyboard",
				key: "",
				label: "",
				text: "",
			};

			this.setIcon(property);
		}

		public destroy(): void {
			this.kimpanel = null;
			this.labelIcon.destroy();
			this.mainIcon.destroy();
			super.destroy();
		}

		public updateProperties(properties?: string[]) {
			if (properties == null) {
				for (const key in this.propertySwitch) {
					const property = this.properties[key];
					const item = this.propertySwitch[key];
					item.setIcon(property.icon);
					item.label.text = property.label;
				}
				return;
			}
			const _properties = Object.fromEntries(
				properties.map((value) => {
					const [key, ...frags] = value.split(":");
					return [key, frags.join(":")];
				}),
			);
			for (const p in this.propertySwitch) {
				if (!(p in _properties) || _properties[p] == null) {
					this.propertySwitch[p].destroy();
					// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
					delete this.propertySwitch[p];
				}
			}

			let count = 0;
			for (const _property of properties) {
				const property = parseProperty(_property);
				if (property == null) {
					continue;
				}
				count++;
				const key = property.key;
				this.properties[key] = property;
				if (key in this.propertySwitch) this.updatePropertyItem(key);
				else this.addPropertyItem(key);
			}
			if (count > 0) {
				this.show();
			} else {
				this.hide();
			}
		}

		public updateProperty(propstr: string): void {
			const property = parseProperty(propstr);
			if (property == null) {
				return;
			}
			const key = property.key;
			this.properties[key] = property;
			this.updateProperties();
		}

		private addPropertyItem(key: string): void {
			if (!(key in this.properties)) {
				return;
			}
			const property = this.properties[key];
			const item = createMenuItem(property);

			item.menuItemActivateId = item.connect("activate", () =>
				this.kimpanel?.triggerProperty(item.key),
			);
			item.menuItemDestroyId = item.connect("destroy", () => {
				item.disconnect(item.menuItemActivateId);
				item.disconnect(item.menuItemDestroyId);
			});
			item.setIcon(property.icon);
			item.label.text = property.label;

			this.propertySwitch[key] = item;
			if ("addMenuItem" in this.menu)
				this.menu.addMenuItem(
					this.propertySwitch[key],
					this.menu.numMenuItems - 3,
				);
		}

		private setIcon(property: MenuItemProperty) {
			for (const hint of property.hint) {
				if (hint.startsWith("label=")) {
					const label = hint.slice(6);
					if (label.length > 0) {
						this.labelIcon.text = extractLabelString(label);
						this.mainIcon.visible = false;
						this.labelIcon.visible = true;
						return;
					}
				}
			}

			const iconName = property.icon;
			const labelName = property.label;

			if (iconName === "") {
				this.labelIcon.text = extractLabelString(labelName);
				this.mainIcon.visible = false;
				this.labelIcon.visible = true;
			} else {
				const gicon = createIcon(iconName);
				if (gicon != null) this.mainIcon.gicon = gicon;
				this.mainIcon.visible = true;
				this.labelIcon.visible = false;
			}
		}

		private updatePropertyItem(key: string): void {
			const property = this.properties[key];
			const item = this.propertySwitch[key];
			item.setIcon(property.icon);
			item.label.text = property.label;
		}
	},
);
