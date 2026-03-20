import {
	defineConfig,
	type RolldownOptions,
	type RolldownPlugin,
} from "rolldown";

/**
 * plugins
 */
const replace = (): RolldownPlugin => {
	return {
		name: "replace",
		transform(code) {
			return {
				code: code
					.replaceAll(/\s*\/\/ begin-remove[\s\S]+?\/\/ end-remove/g, "")
					.replaceAll(/\s*\/\*[\s\S]+?\*\//g, "")
					.replaceAll(/^\s*\/\/.*?\n/gm, ""),
				map: { mappings: "" },
			};
		},
	};
};

export default defineConfig(
	["./src/extension.ts", "./src/prefs.ts"].map<RolldownOptions>((input) => ({
		external: [
			"gi://Adw",
			"gi://Clutter",
			"gi://Gio",
			"gi://Gtk",
			"gi://GLib",
			"gi://GObject",
			"gi://Meta",
			"gi://Mtk",
			"gi://Pango",
			"gi://St",
			"resource:///org/gnome/shell/extensions/extension.js",
			"resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js",
			"resource:///org/gnome/shell/misc/params.js",
			"resource:///org/gnome/shell/ui/boxpointer.js",
			"resource:///org/gnome/shell/ui/keyboard.js",
			"resource:///org/gnome/shell/ui/panelMenu.js",
			"resource:///org/gnome/shell/ui/popupMenu.js",
			"resource:///org/gnome/shell/ui/main.js",
			"resource:///org/gnome/shell/ui/status/keyboard.js",
		],
		input,
		output: {
			codeSplitting: false,
			dir: "dist",
			format: "esm",
		},
		platform: "neutral",
		plugins: [replace()],
	})),
);
