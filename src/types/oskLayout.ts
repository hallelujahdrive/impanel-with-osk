export type Key =
	| KeyBase<
			({ iconName: string } | { label: string }) &
				(
					| { action: "levelSwitch"; level: number | string }
					| { action: "modifier"; keyval: string }
					| { action: string & {} }
					| { keyval: string }
				)
	  >
	| KeyBase<{ strings: string[] }>;

export interface Level {
	level: string;
	mode: string;
	rows: Row[];
}

export interface OskLayout {
	levels: Level[];
	locale: string;
	name: string;
}

type KeyBase<T> = T extends infer A
	? Omit<
			{
				action?: never;
				height?: number;
				iconName?: never;
				keyval?: never;
				label?: never;
				leftOffset?: number;
				level?: never;
				strings?: never;
				width?: number;
			},
			keyof A
		> &
			A
	: never;

type Row = Key[];
