import St from "gi://St";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Params from "resource:///org/gnome/shell/misc/params.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Lib from "./lib.js";
import type { MenuItemProperty } from "./types/menuItem.js";
import type { IKimPanel } from "./types/kimpanel.js";

export const KimIndicator = GObject.registerClass(
  class KimIndicator extends PanelMenu.Button {
    // begin-remove
    private _properties: Record<string, MenuItemProperty>;
    private _propertySwitch: Record<string, typeof Lib.KimMenuItem.prototype>;

    public kimpanel: IKimPanel | null;
    public labelIcon: St.Label;
    public mainIcon: St.Icon;
    // end-remove
    constructor(params: { kimpanel: IKimPanel }) {
      super(0.5, "kimpanel");
      const _params = Params.parse(params, { kimpanel: null });
      this._properties = {};
      this._propertySwitch = {};

      const hbox = new St.BoxLayout({ style_class: "panel-status-menu-box" });
      this.labelIcon = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      this.labelIcon.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
      this.labelIcon.clutter_text.line_wrap = false;
      this.mainIcon = new St.Icon({
        gicon: Lib.createIcon("input-keyboard"),
        style_class: "system-status-icon",
      });
      hbox.add_child(this.labelIcon);
      hbox.add_child(this.mainIcon);
      this.add_child(hbox);
      this._deactive();

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

    destroy() {
      this.kimpanel = null;
      this.labelIcon.destroy();
      this.mainIcon.destroy();
      super.destroy();
    }

    _addPropertyItem(key: string) {
      if (!(key in this._properties)) {
        return;
      }
      const property = this._properties[key];
      const item = Lib.createMenuItem(property);

      item._menuItemActivateId = item.connect("activate", () =>
        this.kimpanel?.triggerProperty(item._key)
      );
      item._menuItemDestroyId = item.connect("destroy", () => {
        item.disconnect(item._menuItemActivateId);
        item.disconnect(item._menuItemDestroyId);
      });
      item.setIcon(property.icon);
      item.label.text = property.label;

      this._propertySwitch[key] = item;
      if ("addMenuItem" in this.menu)
        this.menu.addMenuItem(
          this._propertySwitch[key],
          this.menu.numMenuItems - 3
        );
    }

    _updatePropertyItem(key: string) {
      const property = this._properties[key];
      const item = this._propertySwitch[key];
      item.setIcon(property.icon);
      item.label.text = property.label;
    }

    _updateProperty(propstr: string) {
      const property = Lib.parseProperty(propstr);
      if (property == null) {
        return;
      }
      const key = property.key;
      this._properties[key] = property;
      this._updateProperties();
    }

    _updateProperties(properties?: string[]) {
      if (properties == null) {
        for (const key in this._propertySwitch) {
          const property = this._properties[key];
          const item = this._propertySwitch[key];
          item.setIcon(property.icon);
          item.label.text = property.label;
        }
        return;
      }
      for (const p in this._propertySwitch) {
        if (!(p in properties) || properties[p] == null) {
          this._propertySwitch[p].destroy();
          delete this._propertySwitch[p];
        }
      }

      let count = 0;
      for (const _property of properties) {
        const property = Lib.parseProperty(_property);
        if (property == null) {
          continue;
        }
        count++;
        const key = property.key;
        this._properties[key] = property;
        if (key in this._propertySwitch) this._updatePropertyItem(key);
        else this._addPropertyItem(key);
      }
      if (count > 0) {
        this.show();
      } else {
        this.hide();
      }
    }

    _setIcon(property: MenuItemProperty) {
      for (let i = 0; i < property.hint.length; i++) {
        if (property.hint[i].startsWith("label=")) {
          const label = property.hint[i].slice(6);
          if (label.length > 0) {
            this.labelIcon.text = Lib.extractLabelString(label);
            this.mainIcon.visible = false;
            this.labelIcon.visible = true;
            return;
          }
        }
      }

      const iconName = property.icon;
      const labelName = property.label;

      if (iconName === "") {
        this.labelIcon.text = Lib.extractLabelString(labelName);
        this.mainIcon.visible = false;
        this.labelIcon.visible = true;
      } else {
        const gicon = Lib.createIcon(iconName);
        if (gicon != null) this.mainIcon.gicon = gicon;
        this.mainIcon.visible = true;
        this.labelIcon.visible = false;
      }
    }

    _active() {
      if (this._properties["/Fcitx/im"]) {
        this._setIcon(this._properties["/Fcitx/im"]);
      } else {
        this._deactive();
      }
    }

    _deactive() {
      const property = {
        icon: "input-keyboard",
        label: "",
        text: "",
        key: "",
        hint: [],
      };

      this._setIcon(property);
    }
  }
);
