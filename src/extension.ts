import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { Kimpanel } from "./kimpanel.js";

import "./stylesheet.css";

export default class PlainExampleExtension extends Extension {
	private kimpanel: typeof Kimpanel.prototype | null = null;

	public disable() {
		this.kimpanel?.destroy();
		this.kimpanel = null;
	}

	public enable() {
		if (this.kimpanel) return;

		const settings = this.getSettings(
			"org.gnome.shell.extensions.impanel-with-osk",
		);
		this.kimpanel = new Kimpanel(settings, this.dir);
	}
}
