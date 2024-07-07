declare module "@girs/shell-14" {
  import type Clutter from "gi://Clutter";
  export namespace Shell {
    type CreateOverrideFunc = (originalMethod: function) => function;

    interface Global {
      get stage(): Clutter.Stage;
    }
  }

  export default Shell;
}
