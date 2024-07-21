import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import GObject from "gi://GObject";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const KimpanelPrefsWidget = GObject.registerClass(
  class KimpanelPrefsWidget extends Adw.PreferencesPage {
    // begin-remove
    private _settings: Gio.Settings;
    // end-remove
    constructor(settings: Gio.Settings) {
      super();
      this._settings = settings;

      const miscGroup = new Adw.PreferencesGroup();
      this.add(miscGroup);

      const toggle = new Gtk.Switch({
        action_name: "kimpanel.vertical-list",
        valign: Gtk.Align.CENTER,
      });
      let row = new Adw.ActionRow({
        title: _("Vertical List"),
        activatable_widget: toggle,
      });
      this._settings.bind(
        "vertical",
        toggle,
        "active",
        Gio.SettingsBindFlags.DEFAULT
      );
      row.add_suffix(toggle);
      miscGroup.add(row);

      const button = new Gtk.FontButton();
      row = new Adw.ActionRow({
        title: _("Font"),
        activatable_widget: button,
      });
      this._settings.bind(
        "font",
        button,
        "font",
        Gio.SettingsBindFlags.DEFAULT
      );
      row.add_suffix(button);
      miscGroup.add(row);
    }
  }
);

export default class KimpanelExtensionPreferences extends ExtensionPreferences {
  getPreferencesWidget() {
    return new KimpanelPrefsWidget(this.getSettings());
  }
}
