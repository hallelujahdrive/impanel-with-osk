import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
	gettext as _,
	ExtensionPreferences,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class IMPanelWithOSKExtensionPreferences extends ExtensionPreferences {
	async fillPreferencesWindow(window: Adw.PreferencesWindow) {
		window._settings = this.getSettings(
			"org.gnome.shell.extensions.impanel-with-osk",
		);

		const page = new Adw.PreferencesPage({});

		const imPanelGroup = new Adw.PreferencesGroup({
			title: _("IM Panel"),
		});
		page.add(imPanelGroup);

		const switchRow = new Adw.SwitchRow({
			title: _("Vertical List"),
		});

		window._settings.bind(
			"panel-vertical",
			switchRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		imPanelGroup.add(switchRow);

		const panelFontButton = new Gtk.FontButton({
			valign: Gtk.Align.CENTER,
		});
		const panelFontRow = new Adw.ActionRow({
			activatable_widget: panelFontButton,
			title: _("Font"),
		});
		window._settings.bind(
			"panel-font",
			panelFontButton,
			"font",
			Gio.SettingsBindFlags.DEFAULT,
		);
		panelFontRow.add_suffix(panelFontButton);
		imPanelGroup.add(panelFontRow);

		const oskSuggestionsGroup = new Adw.PreferencesGroup({
			title: _("OSK Suggestions"),
		});
		page.add(oskSuggestionsGroup);
		const oskSuggestionsFontButton = new Gtk.FontButton({
			valign: Gtk.Align.CENTER,
		});
		const oskSuggestionsFontRow = new Adw.ActionRow({
			activatable_widget: oskSuggestionsFontButton,
			title: _("Font"),
		});
		window._settings.bind(
			"osk-suggestions-font",
			oskSuggestionsFontButton,
			"font",
			Gio.SettingsBindFlags.DEFAULT,
		);
		oskSuggestionsFontRow.add_suffix(oskSuggestionsFontButton);
		oskSuggestionsGroup.add(oskSuggestionsFontRow);

		window.add(page);
	}
}
