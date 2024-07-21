import Clutter from "gi://Clutter";
import St from "gi://St";
import GObject from "gi://GObject";
import type Meta from "gi://Meta";
import Mtk from "gi://Mtk";
import Pango from "gi://Pango";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as Params from "resource:///org/gnome/shell/misc/params.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import type { IKimPanel } from "./types/kimpanel.js";

export class Label extends St.Label {
  _buttonReleaseId?: number;
  _enterEventId?: number;
  _labelDestroyId?: number;
  _leaveEventId?: number;
  _touchId?: number;
  candidate_index?: number;
  ignore_focus?: boolean;
}

function createLabel(params: Partial<St.Label.ConstructorProps>): Label {
  const label = new St.Label(params);
  label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
  label.clutter_text.line_wrap = false;
  return label;
}

export const InputPanel = GObject.registerClass(
  class InputPanel extends GObject.Object {
    // begin-remove
    private _arrowSide: St.Side;

    public _cursor: St.Label | null;
    public auxText: St.Label | null;
    public kimpanel: IKimPanel | null;
    public layout: St.BoxLayout | null;
    public lookupTableLayout: St.BoxLayout | null;
    public panel: BoxPointer.BoxPointer | null;
    public preeditText: St.Label | null;
    public text_style: string;
    public upperLayout: St.BoxLayout | null;
    // end-remove

    constructor(params: { kimpanel: IKimPanel }) {
      super();

      const _params = Params.parse(params, { kimpanel: null });
      this.kimpanel = _params.kimpanel;
      this._arrowSide = St.Side.TOP;
      // create boxpointer as UI
      this.panel = new BoxPointer.BoxPointer(this._arrowSide, {
        x_align: Clutter.ActorAlign.START,
      });
      this.panel.style_class = "popup-menu-boxpointer";
      this.panel.add_style_class_name("popup-menu");
      this.panel.add_style_class_name("minwidth-zero");
      this.panel.add_style_class_name("kimpanel-popup-boxpointer");

      this._cursor = new St.Label({});

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
        style_class: "kimpanel-label",
        style: this.text_style,
        text: "",
      });
      this.preeditText = createLabel({
        style_class: "kimpanel-label",
        style: this.text_style,
        text: "",
      });

      this.upperLayout.add_child(this.auxText);
      this.upperLayout.add_child(this.preeditText);
      this.hide();
      this.panel.hide();
    }

    destroy() {
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
      this._cursor?.destroy();
      this._cursor = null;
    }

    setAuxText(text: string): void {
      this.auxText?.set_text(text);
      if (!this.auxText?.visible) {
        this.auxText?.show();
      }
    }

    setPreeditText(text: string, pos: number): void {
      const cat = `${text.slice(0, pos)}|${text.slice(pos)}`;
      this.preeditText?.set_text(cat);
      if (!this.preeditText?.visible) this.preeditText?.show();
    }

    _candidateClicked(widget: St.Label & { candidate_index: number }) {
      this.kimpanel?.selectCandidate(widget.candidate_index);
    }

    setLookupTable(label: string[], table: string[], visible: boolean) {
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
            style_class: "popup-menu-item kimpanel-label",
            style: this.text_style,
            text: "",
            reactive: true,
          });
          item.add_style_class_name("kimpanel-candidate-item");
          item.candidate_index = 0;
          item.ignore_focus = true;
          item._buttonReleaseId = item.connect(
            "button-release-event",
            (widget) => {
              if (!widget.ignore_focus) this._candidateClicked(widget);
            }
          );
          item._enterEventId = item.connect("enter-event", (widget) => {
            if (!widget.ignore_focus) widget.add_style_pseudo_class("hover");
          });
          item._leaveEventId = item.connect("leave-event", (widget) => {
            if (!widget.ignore_focus) widget.remove_style_pseudo_class("hover");
          });
          item._labelDestroyId = item.connect("destroy", () => {
            if (item._buttonReleaseId != null)
              item.disconnect(item._buttonReleaseId);
            if (item._enterEventId != null) item.disconnect(item._enterEventId);
            if (item._leaveEventId != null) item.disconnect(item._leaveEventId);
            if (item._labelDestroyId != null)
              item.disconnect(item._labelDestroyId);
            if (item._touchId != null) item.disconnect(item._touchId);
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
        lookupTable[i].candidate_index = i;
        lookupTable[i].text = label[i] + table[i];
      }
    }

    setLookupTableCursor(cursor: number): void {
      (this.lookupTableLayout?.get_children() as Label[]).forEach(
        (label, i) => {
          if (i === cursor) {
            label.add_style_pseudo_class("active");
          } else {
            label.remove_style_pseudo_class("active");
          }
        }
      );
    }

    setVertical(vertical: boolean): void {
      this.lookupTableLayout?.set_vertical(vertical);
    }

    updateFont(textStyle: string): void {
      this.text_style = textStyle;
      this.auxText?.set_style(this.text_style);
      this.preeditText?.set_style(this.text_style);
      const lookupTable = this.lookupTableLayout?.get_children();

      if (lookupTable == null) return;

      for (const label of lookupTable as Label[]) {
        label.set_style(this.text_style);
      }
    }

    hideAux() {
      if (this.auxText?.visible) this.auxText.hide();
    }

    hidePreedit() {
      if (this.preeditText?.visible) this.preeditText.hide();
    }

    updatePosition() {
      const kimpanel = this.kimpanel;
      if (kimpanel == null || this.panel == null) return;

      let x = kimpanel.x;
      let y = kimpanel.y;
      let w = kimpanel.w;
      let h = kimpanel.h;

      if (kimpanel.relative) {
        if (global.display.focus_window) {
          const shellScale = St.ThemeContext.get_for_stage(
            global.stage
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
      const rect = new Mtk.Rectangle({ x: x, y: y, width: w, height: h });
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
        this._arrowSide = St.Side.BOTTOM;

        if (y + h >= monitor.y + monitor.height) {
          y = monitor.y + monitor.height - 1;
          h = 1;
        }
      } else {
        this._arrowSide = St.Side.TOP;
      }

      if (x < monitor.x) {
        x = monitor.x;
      }
      if (x >= monitor.x + monitor.width) {
        x = monitor.x + monitor.width - 1;
      }

      this._cursor?.set_position(x, y);
      this._cursor?.set_size(w === 0 ? 1 : w, h === 0 ? 1 : h);

      this.panel._arrowSide = this._arrowSide;

      const visible =
        kimpanel.showAux || kimpanel.showPreedit || kimpanel.showLookupTable;

      if (visible) {
        this.show();
      } else {
        this.hide();
      }
    }

    show() {
      if (this._cursor != null) this.panel?.setPosition(this._cursor, 0.0);
      this.panel?.open(BoxPointer.PopupAnimation.NONE);
      this.panel?.get_parent()?.set_child_above_sibling(this.panel, null);
    }

    hide() {
      this.panel?.close(BoxPointer.PopupAnimation.NONE);
    }
  }
);
