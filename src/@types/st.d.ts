import type StBase from "@girs/st-14";

declare module "gi://St" {
	namespace St {
		interface Button<A = unknown> {
			_extendedKeys: null | StBase.BoxLayout;
			extendedKey: null | string;
		}
		interface Widget {
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
}
