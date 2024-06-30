import type Gio from "gi://Gio";
import {
	Extension,
	type ExtensionMetadata,
} from "resource:///org/gnome/shell/extensions/extension.js";
import { Kimpanel } from "./kimpanel.js";

import "./stylesheet.css";

export default class PlainExampleExtension extends Extension {
	private kimpanel: typeof Kimpanel.prototype | null = null;
	private settings: Gio.Settings;

	constructor(metadata: ExtensionMetadata) {
		super(metadata);

		this.settings = this.getSettings();
	}

	public disable() {
		this.kimpanel?.destroy();
		this.kimpanel = null;
	}

	public enable() {
		if (this.kimpanel) return;
		this.kimpanel = new Kimpanel(this.settings, this.dir);
	}
}
