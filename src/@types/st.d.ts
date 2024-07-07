import "gi://St";

declare module "@girs/st-14" {
  export namespace St {
    interface Button {
      _extendedKeys: StBase.BoxLayout | null;
      extendedKey: string | null;

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

  export default St;
}
