import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import type Meta from "gi://Meta";
import Mtk from "gi://Mtk";
import Pango from "gi://Pango";
import St from "gi://St";
import * as Params from "resource:///org/gnome/shell/misc/params.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { IKimPanel } from "./types/kimpanel.js";

export class Label extends St.Label {
	buttonReleaseId?: number;
	candidateIndex?: number;
	enterEventId?: number;
	ignore_focus?: boolean;
	labelDestroyId?: number;
	leaveEventId?: number;
	touchId?: number;
}

const createLabel = (params: Partial<St.Label.ConstructorProps>): Label => {
	const label = new St.Label(params);
	label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
	label.clutter_text.line_wrap = false;
	return label;
};

export const InputPanel = GObject.registerClass(
	class InputPanel extends GObject.Object {
		// begin-remove
		public auxText: St.Label | null;
		public cursor: St.Label | null;
		public kimpanel: IKimPanel | null;
		public layout: St.BoxLayout | null;
		public lookupTableLayout: St.BoxLayout | null;
		public panel: BoxPointer.BoxPointer | null;
		public preeditText: St.Label | null;
		public text_style: string;
		public upperLayout: St.BoxLayout | null;

		private arrowSide: St.Side;
		// end-remove
		constructor(params: { kimpanel: IKimPanel }) {
			super();

			const _params = Params.parse(params, { kimpanel: null });
			this.kimpanel = _params.kimpanel;
			this.arrowSide = St.Side.TOP;
			// create boxpointer as UI
			this.panel = new BoxPointer.BoxPointer(this.arrowSide, {
				x_align: Clutter.ActorAlign.START,
			});
			this.panel.style_class = "popup-menu-boxpointer";
			this.panel.add_style_class_name("popup-menu");
			this.panel.add_style_class_name("minwidth-zero");
			this.panel.add_style_class_name("kimpanel-popup-boxpointer");

			this.cursor = new St.Label({});

			this.layout = new St.BoxLayout({
				style_class: "popup-menu-content",
				vertical: true,
			});
			this.layout.add_style_class_name("kimpanel-popup-content");
			this.panel.bin.set_child(this.layout);

			this.upperLayout = new St.BoxLayout();
			this.lookupTableLayout = new St.BoxLayout({
				vertical: this.kimpanel.isLookupTableVertical(),
			});

			this.layout.add_child(this.upperLayout);

			this.text_style = this.kimpanel.getTextStyle();
			this.auxText = createLabel({
				style: this.text_style,
				style_class: "kimpanel-label",
				text: "",
			});
			this.preeditText = createLabel({
				style: this.text_style,
				style_class: "kimpanel-label",
				text: "",
			});

			this.upperLayout.add_child(this.auxText);
			this.upperLayout.add_child(this.preeditText);
			this.hide();
			this.panel.hide();
		}

		public destroy(): void {
			if (!this.kimpanel) {
				return;
			}
			this.kimpanel = null;
			this.layout = null;
			this.upperLayout = null;
			this.lookupTableLayout = null;
			this.auxText = null;
			this.preeditText = null;
			this.panel?.destroy();
			this.panel = null;
			this.cursor?.destroy();
			this.cursor = null;
		}

		public hideAux(): void {
			if (this.auxText?.visible) this.auxText.hide();
		}

		public hidePreedit(): void {
			if (this.preeditText?.visible) this.preeditText.hide();
		}

		public setAuxText(text: string): void {
			this.auxText?.set_text(text);
			if (!this.auxText?.visible) {
				this.auxText?.show();
			}
		}

		public setLookupTable(
			label: string[],
			table: string[],
			visible: boolean,
		): void {
			const len = visible ? table.length : 0;
			const labelLen = this.lookupTableLayout?.get_children().length ?? 0;

			if (labelLen > 0 && len === 0) {
				if (this.lookupTableLayout != null)
					this.layout?.remove_child(this.lookupTableLayout);
			} else if (labelLen === 0 && len > 0) {
				if (this.lookupTableLayout != null)
					this.layout?.add_child(this.lookupTableLayout);
			}

			// if number is not enough, create new
			if (len > labelLen) {
				for (let i = 0; i < len - labelLen; i++) {
					const item = createLabel({
						reactive: true,
						style: this.text_style,
						style_class: "popup-menu-item kimpanel-label",
						text: "",
					});
					item.add_style_class_name("kimpanel-candidate-item");
					item.candidateIndex = 0;
					item.ignore_focus = true;
					item.buttonReleaseId = item.connect(
						"button-release-event",
						(widget) => {
							if (!widget.ignore_focus) this.candidateClicked(widget);
						},
					);
					item.enterEventId = item.connect("enter-event", (widget) => {
						if (!widget.ignore_focus) widget.add_style_pseudo_class("hover");
					});
					item.leaveEventId = item.connect("leave-event", (widget) => {
						if (!widget.ignore_focus) widget.remove_style_pseudo_class("hover");
					});
					item.labelDestroyId = item.connect("destroy", () => {
						if (item.buttonReleaseId != null)
							item.disconnect(item.buttonReleaseId);
						if (item.enterEventId != null) item.disconnect(item.enterEventId);
						if (item.leaveEventId != null) item.disconnect(item.leaveEventId);
						if (item.labelDestroyId != null)
							item.disconnect(item.labelDestroyId);
						if (item.touchId != null) item.disconnect(item.touchId);
					});
					this.lookupTableLayout?.add_child(item);
				}
			} else if (len < labelLen) {
				// else destroy unnecessary one
				for (let i = 0; i < labelLen - len; i++) {
					this.lookupTableLayout?.get_children()[0].destroy();
				}
			}

			// update label and text
			const lookupTable = this.lookupTableLayout?.get_children() as Label[];
			if (lookupTable == null) return;

			for (let i = 0; i < lookupTable.length; i++) {
				if (label[i].length === 0) lookupTable[i].ignore_focus = true;
				else lookupTable[i].ignore_focus = false;
				lookupTable[i].candidateIndex = i;
				lookupTable[i].text = label[i] + table[i];
			}
		}

		public setLookupTableCursor(cursor: number): void {
			(this.lookupTableLayout?.get_children() as Label[]).forEach(
				(label, i) => {
					if (i === cursor) {
						label.add_style_pseudo_class("active");
					} else {
						label.remove_style_pseudo_class("active");
					}
				},
			);
		}

		public setPreeditText(text: string, pos: number): void {
			const cat = `${text.slice(0, pos)}|${text.slice(pos)}`;
			this.preeditText?.set_text(cat);
			if (!this.preeditText?.visible) this.preeditText?.show();
		}

		public setVertical(vertical: boolean): void {
			this.lookupTableLayout?.set_vertical(vertical);
		}

		public updateFont(textStyle: string): void {
			this.text_style = textStyle;
			this.auxText?.set_style(this.text_style);
			this.preeditText?.set_style(this.text_style);
			const lookupTable = this.lookupTableLayout?.get_children();

			if (lookupTable == null) return;

			for (const label of lookupTable as Label[]) {
				label.set_style(this.text_style);
			}
		}

		public updatePosition(): void {
			const kimpanel = this.kimpanel;
			if (kimpanel == null || this.panel == null) return;

			let x = kimpanel.x;
			let y = kimpanel.y;
			let w = kimpanel.w;
			let h = kimpanel.h;

			if (kimpanel.relative) {
				if (global.display.focus_window) {
					const shellScale = St.ThemeContext.get_for_stage(
						global.stage,
					).scale_factor;
					const window =
						global.display.focus_window.get_compositor_private<Meta.WindowActor>();
					if (window) {
						x = window.x + x * (shellScale / kimpanel.scale);
						y = window.y + y * (shellScale / kimpanel.scale);
						w = w * (shellScale / kimpanel.scale);
						h = h * (shellScale / kimpanel.scale);
					}
				}
			}
			const rect = new Mtk.Rectangle({ height: h, width: w, x: x, y: y });
			const monitor =
				Main.layoutManager.monitors[
					global.display.get_monitor_index_for_rect(rect)
				];
			const panel_height = this.panel?.get_height();

			if (h === 0) {
				h = 20;
				y = y - 20;
			}

			if (y + panel_height + h >= monitor.y + monitor.height) {
				this.arrowSide = St.Side.BOTTOM;

				if (y + h >= monitor.y + monitor.height) {
					y = monitor.y + monitor.height - 1;
					h = 1;
				}
			} else {
				this.arrowSide = St.Side.TOP;
			}

			if (x < monitor.x) {
				x = monitor.x;
			}
			if (x >= monitor.x + monitor.width) {
				x = monitor.x + monitor.width - 1;
			}

			this.cursor?.set_position(x, y);
			this.cursor?.set_size(w === 0 ? 1 : w, h === 0 ? 1 : h);

			this.panel._arrowSide = this.arrowSide;

			const visible =
				kimpanel.showAux || kimpanel.showPreedit || kimpanel.showLookupTable;

			if (visible) {
				this.show();
			} else {
				this.hide();
			}
		}

		private candidateClicked(
			widget: St.Label & { candidate_index: number },
		): void {
			this.kimpanel?.selectCandidate(widget.candidate_index);
		}

		private hide(): void {
			this.panel?.close(BoxPointer.PopupAnimation.NONE);
		}

		private show(): void {
			if (this.cursor != null) this.panel?.setPosition(this.cursor, 0.0);
			this.panel?.open(BoxPointer.PopupAnimation.NONE);
			this.panel?.get_parent()?.set_child_above_sibling(this.panel, null);
		}
	},
);
