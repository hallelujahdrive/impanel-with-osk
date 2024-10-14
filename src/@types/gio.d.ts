import "@girs/gio-2.0";

declare module "@girs/gio-2.0/gio-2.0" {
	export namespace Gio {
		interface DBusExportedObject {
			emit_signal(name: string, variant: GLib.Variant | null): void;
		}
	}

	export default Gio;
}
