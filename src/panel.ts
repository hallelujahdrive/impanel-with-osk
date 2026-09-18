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
		public auxText: null | St.Label;
		public cursor: null | St.Label;
		public kimpanel: IKimPanel | null;
		public layout: null | St.BoxLayout;
		public lookupTableLayout: null | St.BoxLayout;
		public panel: BoxPointer.BoxPointer | null;
		public preeditText: null | St.Label;
		public text_style: string;
		public upperLayout: null | St.BoxLayout;

		private arrowSide: St.Side;
		private candidateLabels: Label[];
		private lookupCursor: number;
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
			this.candidateLabels = [];
			this.lookupCursor = -1;

			this.layout.add_child(this.upperLayout);

			this.text_style = this.kimpanel.getPanelTextStyle();
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
			this.auxText.hide();
			this.preeditText.hide();
			this.hide();
			this.panel.hide();
		}

		public destroy(): void {
			if (!this.kimpanel) {
				return;
			}
			this.kimpanel = null;
			this.layout?.destroy();
			this.layout = null;
			this.upperLayout?.destroy();
			this.upperLayout = null;
			this.lookupTableLayout?.destroy();
			this.lookupTableLayout = null;
			this.candidateLabels = [];
			this.lookupCursor = -1;
			this.auxText?.destroy();
			this.auxText = null;
			this.preeditText?.destroy();
			this.preeditText = null;
			this.panel?.destroy();
			this.panel = null;
			this.cursor?.destroy();
			this.cursor = null;
		}

		public hideAux(): void {
			this.unparentHiddenLabel(this.auxText);
		}

		public hidePreedit(): void {
			this.unparentHiddenLabel(this.preeditText);
		}

		public setAuxText(text: string): void {
			this.showUpperLabel(this.auxText, text);
		}

		public setLookupTable(
			label: string[],
			table: string[],
			visible: boolean,
		): void {
			const lookup = this.lookupTableLayout;
			if (lookup == null) return;

			const len = visible ? table.length : 0;

			while (this.candidateLabels.length < len) {
				this.candidateLabels.push(this.createCandidateLabel());
			}

			for (let i = 0; i < this.candidateLabels.length; i++) {
				const item = this.candidateLabels[i];
				const parent = item.get_parent();

				if (i < len) {
					item.ignore_focus = label[i].length === 0;
					item.candidateIndex = i;
					item.text = `${label[i]}${table[i]}`;
					item.set_width(-1);
					if (parent !== lookup) lookup.insert_child_at_index(item, i);
					if (!item.visible) item.show();
				} else if (parent != null) {
					parent.remove_child(item);
					item.remove_style_pseudo_class("active");
					item.hide();
				}
			}

			const attached = lookup.get_parent() === this.layout;
			if (len === 0) {
				if (attached) this.layout?.remove_child(lookup);
			} else if (!attached) {
				this.layout?.add_child(lookup);
			}

			if (this.lookupCursor >= len) this.lookupCursor = -1;
			this.releaseWidth(lookup);
			this.releaseWidth(this.layout);
			this.releaseWidth(this.panel);
		}

		public setLookupTableCursor(cursor: number): void {
			if (this.lookupCursor === cursor) return;

			const previous = this.candidateLabels[this.lookupCursor];
			if (previous != null) previous.remove_style_pseudo_class("active");

			const current = this.candidateLabels[cursor];
			if (current != null) current.add_style_pseudo_class("active");

			this.lookupCursor = cursor;
		}

		public setPreeditText(text: string, pos: number): void {
			this.showUpperLabel(
				this.preeditText,
				`${text.slice(0, pos)}|${text.slice(pos)}`,
			);
		}

		public setVertical(vertical: boolean): void {
			this.lookupTableLayout?.set_vertical(vertical);
		}

		public updateFont(textStyle: string): void {
			this.text_style = textStyle;
			this.auxText?.set_style(this.text_style);
			this.preeditText?.set_style(this.text_style);

			for (const label of this.candidateLabels) {
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

		private candidateClicked(widget: Label): void {
			this.kimpanel?.selectCandidate(widget.candidateIndex);
		}

		private createCandidateLabel(): Label {
			const item = createLabel({
				reactive: true,
				style: this.text_style,
				style_class: "popup-menu-item kimpanel-label",
				text: "",
			});
			item.add_style_class_name("kimpanel-candidate-item");
			item.candidateIndex = 0;
			item.ignore_focus = true;
			item.buttonReleaseId = item.connect("button-release-event", (widget) => {
				if (!widget.ignore_focus) this.candidateClicked(widget);
			});
			item.enterEventId = item.connect("enter-event", (widget) => {
				if (!widget.ignore_focus) widget.add_style_pseudo_class("hover");
			});
			item.leaveEventId = item.connect("leave-event", (widget) => {
				if (!widget.ignore_focus) widget.remove_style_pseudo_class("hover");
			});
			item.labelDestroyId = item.connect("destroy", () => {
				if (item.buttonReleaseId != null) item.disconnect(item.buttonReleaseId);
				if (item.enterEventId != null) item.disconnect(item.enterEventId);
				if (item.leaveEventId != null) item.disconnect(item.leaveEventId);
				if (item.labelDestroyId != null) item.disconnect(item.labelDestroyId);
				if (item.touchId != null) item.disconnect(item.touchId);
			});
			return item;
		}

		private hide(): void {
			this.panel?.close(BoxPointer.PopupAnimation.NONE);
		}

		private releaseWidth(actor: Clutter.Actor | null): void {
			actor?.set_width(-1);
			actor?.queue_relayout();
		}

		private show(): void {
			if (this.cursor != null) this.panel?.setPosition(this.cursor, 0.0);
			this.panel?.open(BoxPointer.PopupAnimation.NONE);
			this.panel?.get_parent()?.set_child_above_sibling(this.panel, null);
		}

		private showUpperLabel(label: null | St.Label, text: string): void {
			if (label == null || this.upperLayout == null) return;

			label.set_text(text);
			label.set_width(-1);
			if (label.get_parent() !== this.upperLayout)
				this.upperLayout.add_child(label);
			if (!label.visible) label.show();
			this.releaseWidth(this.upperLayout);
			this.releaseWidth(this.layout);
			this.releaseWidth(this.panel);
		}

		private unparentHiddenLabel(label: null | St.Label): void {
			if (label == null) return;
			if (label.visible) label.hide();
			const parent = label.get_parent();
			if (parent != null) parent.remove_child(label);
			label.set_width(-1);
			this.releaseWidth(this.upperLayout);
			this.releaseWidth(this.layout);
			this.releaseWidth(this.panel);
		}
	},
);
