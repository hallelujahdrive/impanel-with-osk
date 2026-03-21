export {};

declare module "@girs/meta-17/meta-17" {
	export namespace Meta {
		interface Backend {
			lock_layout_group(idx: number): void;
		}

		interface Context {
			get_backend(): Backend & { lock_layout_group(idx: number): void };
		}
	}
}
