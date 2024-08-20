import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
	ExtensionPreferences,
	gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class IMPanelWithOSKExtensionPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window: Adw.PreferencesWindow) {
		window._settings = this.getSettings(
			"org.gnome.shell.extensions.impanel-with-osk",
		);

		const page = new Adw.PreferencesPage({});

		const group = new Adw.PreferencesGroup();
		page.add(group);

		const switchRow = new Adw.SwitchRow({
			title: _("Vertical List"),
		});

		window._settings.bind(
			"vertical",
			switchRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		group.add(switchRow);

		const button = new Gtk.FontButton();
		const fontRow = new Adw.ActionRow({
			activatable_widget: button,
			title: _("Font"),
		});
		window._settings.bind(
			"font",
			button,
			"font",
			Gio.SettingsBindFlags.DEFAULT,
		);
		fontRow.add_suffix(button);
		group.add(fontRow);

		window.add(page);
	}
}
