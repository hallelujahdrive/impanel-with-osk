import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
	ExtensionPreferences,
	gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const KimpanelPrefsWidget = GObject.registerClass(
	class KimpanelPrefsWidget extends Adw.PreferencesPage {
		constructor(private readonly settings: Gio.Settings) {
			super();
			const miscGroup = new Adw.PreferencesGroup();
			this.add(miscGroup);

			const toggle = new Gtk.Switch({
				action_name: "kimpanel.vertical-list",
				valign: Gtk.Align.CENTER,
			});
			let row = new Adw.ActionRow({
				activatable_widget: toggle,
				title: _("Vertical List"),
			});
			this.settings.bind(
				"vertical",
				toggle,
				"active",
				Gio.SettingsBindFlags.DEFAULT,
			);
			row.add_suffix(toggle);
			miscGroup.add(row);

			const button = new Gtk.FontButton();
			row = new Adw.ActionRow({
				activatable_widget: button,
				title: _("Font"),
			});
			this.settings.bind("font", button, "font", Gio.SettingsBindFlags.DEFAULT);
			row.add_suffix(button);
			miscGroup.add(row);
		}
	},
);

export default class KimpanelExtensionPreferences extends ExtensionPreferences {
	getPreferencesWidget() {
		return new KimpanelPrefsWidget(this.getSettings());
	}
}
