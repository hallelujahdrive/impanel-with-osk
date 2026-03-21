import type Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { Kimpanel } from "./kimpanel.js";

export default class IMPanelWithOSK extends Extension {
	private kimpanel: null | typeof Kimpanel.prototype = null;
	private settings: Gio.Settings | null = null;

	public disable() {
		this.kimpanel?.destroy();
		this.kimpanel = null;
		this.settings = null;
	}

	public enable() {
		if (this.kimpanel) return;

		this.settings = this.getSettings(
			"org.gnome.shell.extensions.impanel-with-osk",
		);
		this.kimpanel = new Kimpanel(
			this.settings,
			this.dir as unknown as Gio.File,
		);
	}
}
