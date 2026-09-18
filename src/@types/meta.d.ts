import "@girs/meta-18";

declare module "@girs/meta-18/meta-18" {
	export namespace Meta {
		interface Backend {
			lock_layout_group(idx: number): void;
		}
	}

	export default Meta;
}
