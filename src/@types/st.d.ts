import type StBase from "@girs/st-14";

declare module "@girs/st-14/st-14" {
	export namespace St {
		interface Button {
			_extendedKeys: null | StBase.BoxLayout;
			extendedKey: null | string;
		}
		interface Widget {
			connectObject(
				id: string,
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				callback: (...args: any[]) => any,
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				arg: any,
			): number;

			disconnectObject(thisObj: object, obj?: object): void;
		}
	}

	export default St;
}
