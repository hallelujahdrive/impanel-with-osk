import type ClutterBase from "gi://Clutter";

declare module "@girs/clutter-14" {
  export namespace Clutter {
    interface Stage extends ClutterBase.Stage {
      connectObject(
        id: string,
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        callback: (...args: any[]) => any,
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        arg: any
      ): number;

      disconnectObject(thisObj: object, obj?: object): void;
    }
  }

  export default Clutter;
}
