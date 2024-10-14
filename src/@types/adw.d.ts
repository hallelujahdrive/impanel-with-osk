import "@girs/adw-1";

declare module "@girs/adw-1/adw-1" {
	export namespace Adw {
		interface PreferencesWindow {
			_settings: Gio.Settings;
		}
	}

	export default Adw;
}
