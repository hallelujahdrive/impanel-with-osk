import "@girs/clutter-14";

declare module "@girs/clutter-14/clutter-14" {
	export namespace Clutter {
		interface Stage {
			connectObject(
				id: string,
				// biome-ignore lint/suspicious/noExplicitAny: GIR callback signature
				callback: (...args: any[]) => any,
				// biome-ignore lint/suspicious/noExplicitAny: GIR this arg
				arg: any,
			): number;

			disconnectObject(thisObj: object, obj?: object): void;
		}
	}

	export default Clutter;
}
