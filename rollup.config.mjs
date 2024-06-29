import typescript from "@rollup/plugin-typescript";

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
  input: ["src/extension.ts"],
  output: {
    format: "es",
    dir: "dist",
  },
  external: [
    "gi://Clutter",
    "gi://Gio",
    "gi://GLib",
    "gi://GObject",
    "gi://Meta",
    "gi://St",
    "resource:///org/gnome/shell/ui/boxpointer.js",
    "resource:///org/gnome/shell/extensions/extension.js",
    "resource:///org/gnome/shell/ui/keyboard.js",
    "resource:///org/gnome/shell/extensions/extension.js",
    "resource:///org/gnome/shell/ui/main.js",
  ],
  plugins: [
    typescript({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Node",
      },
    }),
    replace(),
  ],
};
