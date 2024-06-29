declare module "@girs/shell-14" {
  import type Clutter from "gi://Clutter";
  import type ShellBase from "gi://Shell";

  export namespace Shell {
    type CreateOverrideFunc = (originalMethod: function) => function;

    interface Global extends ShellBase.Global {
      get stage(): Clutter.Stage;
    }
  }

  export default Shell;
}
