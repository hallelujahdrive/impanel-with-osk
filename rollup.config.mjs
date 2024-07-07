import scss from "rollup-plugin-scss";
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";

import packageJson from "./package.json" with { type: "json" };

/**
 * plugins
 */
const replace = () => {
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

/** @type {import("rollup").RollupOptions} */
export default {
  input: ["src/extension.ts", "src/prefs.ts"],
  output: {
    format: "es",
    dir: "dist",
  },
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
  ],
  plugins: [
    scss({ fileName: "stylesheet.css" }),
    nodeResolve({
      resolveOnly: [...Object.keys(packageJson.devDependencies)],
    }),
    typescript({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Node",
      },
    }),
    replace(),
  ],
};
