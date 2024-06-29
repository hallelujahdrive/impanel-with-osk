type KeyBase<T> = T extends infer A
  ? Omit<
      {
        action?: never;
        iconName?: never;
        keyval?: never;
        label?: never;
        level?: never;
        height?: number;
        leftOffset?: number;
        strings?: never;
        width?: number;
      },
      keyof A
    > &
      A
  : never;

export type Key =
  | KeyBase<
      ({ iconName: string } | { label: string }) &
        (
          | { action: "levelSwitch"; level: string | number }
          | { action: "modifier"; keyval: string }
          | { action: string & {} }
          | { keyval: string }
        )
    >
  | KeyBase<{ strings: string[] }>;

type Row = Key[];

export type OskLayout = {
  levels: Level[];
  locale: string;
  name: string;
};

export type Level = {
  level: string;
  mode: string;
  rows: Row[];
};
