declare module "@girs/shell-14" {
	import type Clutter from "gi://Clutter";
	import type Meta from "gi://Meta";

	export namespace Shell {
		type CreateOverrideFunc = (originalMethod: function) => function;

		interface Global {
			get display(): Meta.Display;

			get stage(): Clutter.Stage;
		}
	}

	export default Shell;
}
