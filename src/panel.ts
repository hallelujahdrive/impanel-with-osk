import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import type Meta from "gi://Meta";
import Mtk from "gi://Mtk";
import Pango from "gi://Pango";
import St from "gi://St";
import * as Params from "resource:///org/gnome/shell/misc/params.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { SpotRect } from "./inputState.js";
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
		declare public auxText: null | St.Label;
		declare public cursor: null | St.Label;
		declare public kimpanel: IKimPanel | null;
		declare public layout: null | St.BoxLayout;
		declare public lookupTableLayout: null | St.BoxLayout;
		declare public panel: BoxPointer.BoxPointer | null;
		declare public preeditText: null | St.Label;
		declare public text_style: string;
		declare public upperLayout: null | St.BoxLayout;

		declare private arrowSide: St.Side;
		declare private candidateLabels: Label[];
		declare private lookupCursor: number;

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
				orientation: Clutter.Orientation.VERTICAL,
				style_class: "popup-menu-content",
			});
			this.layout.add_style_class_name("kimpanel-popup-content");
			this.panel.bin.set_child(this.layout);

			this.upperLayout = new St.BoxLayout();
			this.lookupTableLayout = new St.BoxLayout({
				orientation: this.kimpanel.getLookupTableOrientation(),
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

		public hideLookup(): void {
			const lookup = this.lookupTableLayout;
			if (lookup == null) return;
			const parent = lookup.get_parent();
			if (parent == null) return;
			parent.remove_child(lookup);
			this.releaseSize(this.layout);
			this.releaseSize(this.panel);
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
					const text = `${label[i]}${table[i]}`;
					const ignoreFocus = label[i].length === 0;
					if (
						item.text !== text ||
						item.ignore_focus !== ignoreFocus ||
						item.candidateIndex !== i
					) {
						item.ignore_focus = ignoreFocus;
						item.candidateIndex = i;
						item.text = text;
						item.set_width(-1);
					}
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
			this.releaseSize(lookup);
			this.releaseSize(this.layout);
			this.releaseSize(this.panel);
		}

		public setLookupTableCursor(cursor: number): void {
			if (this.lookupCursor === cursor) return;

			const previous = this.candidateLabels[this.lookupCursor];
			if (previous != null) previous.remove_style_pseudo_class("active");

			const current = this.candidateLabels[cursor];
			if (current != null) current.add_style_pseudo_class("active");

			this.lookupCursor = cursor;
		}

		public setOrientation(orientation: Clutter.Orientation): void {
			const lookup = this.lookupTableLayout;
			if (lookup == null) return;

			const manager = lookup.layout_manager as Clutter.BoxLayout | null;
			const current = manager?.orientation ?? lookup.orientation;
			if (current === orientation) return;

			const parent = lookup.get_parent();
			if (parent != null) parent.remove_child(lookup);

			lookup.orientation = orientation;
			if (manager != null) manager.orientation = orientation;

			for (const item of this.candidateLabels) {
				item.set_size(-1, -1);
			}

			if (parent != null) parent.add_child(lookup);

			this.releaseSize(lookup);
			this.releaseSize(this.layout);
			this.releaseSize(this.panel);
		}

		public setPreeditText(text: string, pos: number): void {
			this.showUpperLabel(
				this.preeditText,
				`${text.slice(0, pos)}|${text.slice(pos)}`,
			);
		}

		public updateFont(textStyle: string): void {
			this.text_style = textStyle;
			this.auxText?.set_style(this.text_style);
			this.preeditText?.set_style(this.text_style);

			for (const label of this.candidateLabels) {
				label.set_style(this.text_style);
			}
		}

		public updatePosition(spot: SpotRect, visible: boolean): void {
			if (this.panel == null) return;

			let x = spot.x;
			let y = spot.y;
			let w = spot.w;
			let h = spot.h;

			if (spot.relative) {
				if (global.display.focus_window) {
					const shellScale = St.ThemeContext.get_for_stage(
						global.stage,
					).scale_factor;
					const window =
						global.display.focus_window.get_compositor_private<Meta.WindowActor>();
					if (window) {
						x = window.x + x * (shellScale / spot.scale);
						y = window.y + y * (shellScale / spot.scale);
						w = w * (shellScale / spot.scale);
						h = h * (shellScale / spot.scale);
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

		private releaseSize(actor: Clutter.Actor | null): void {
			actor?.set_size(-1, -1);
			actor?.queue_relayout();
		}

		private show(): void {
			if (this.cursor != null) this.panel?.setPosition(this.cursor, 0.0);
			this.panel?.open(BoxPointer.PopupAnimation.NONE);
			this.panel?.get_parent()?.set_child_above_sibling(this.panel, null);
		}

		private showUpperLabel(label: null | St.Label, text: string): void {
			if (label == null || this.upperLayout == null) return;
			if (
				label.text === text &&
				label.visible &&
				label.get_parent() === this.upperLayout
			) {
				return;
			}

			label.set_text(text);
			label.set_width(-1);
			if (label.get_parent() !== this.upperLayout)
				this.upperLayout.add_child(label);
			if (!label.visible) label.show();
			this.releaseSize(this.upperLayout);
			this.releaseSize(this.layout);
			this.releaseSize(this.panel);
		}

		private unparentHiddenLabel(label: null | St.Label): void {
			if (label == null) return;
			const parent = label.get_parent();
			if (!label.visible && parent == null) return;
			if (label.visible) label.hide();
			if (parent != null) parent.remove_child(label);
			label.set_width(-1);
			this.releaseSize(this.upperLayout);
			this.releaseSize(this.layout);
			this.releaseSize(this.panel);
		}
	},
);
