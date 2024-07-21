import GObject from "gi://GObject";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { InputPanel } from "./panel.js";
import { KimIndicator } from "./indicator.js";
import { KimMenu } from "./menu.js";
import * as Lib from "./lib.js";
import type { IKimPanel } from "./types/kimpanel.js";
import { Keyboard } from "./keyboard.js";

const FCITX_BUS_NAME = "org.fcitx.Fcitx5" as const;
const FCITX_CONTROLLER_OBJECT_PATH = "/controller" as const;
const FCITX_INTERFACE_CONTROLLER = "org.fcitx.Fcitx.Controller1" as const;

const KIMPANEL_INTERFACE_INPUTMETHOD = "org.kde.kimpanel.inputmethod" as const;

const KimpanelIface = `<node>
<interface name="org.kde.impanel">
  <signal name="MovePreeditCaret">
    <arg type="i" name="position" />
  </signal>
  <signal name="SelectCandidate">
    <arg type="i" name="index" />
  </signal>
  <signal name="LookupTablePageUp"></signal>
  <signal name="LookupTablePageDown"></signal>
  <signal name="TriggerProperty"> 
    <arg type="s" name="key" />
  </signal>
  <signal name="PanelCreated"></signal>
  <signal name="Exit"></signal>
  <signal name="ReloadConfig"></signal>
  <signal name="Configure"></signal>
  </interface>
</node>`;

const Kimpanel2Iface = `<node>
<interface name="org.kde.impanel2">
  <signal name="PanelCreated2"></signal>
  <method name="SetSpotRect">
    <arg type="i" name="x" direction="in" />
    <arg type="i" name="y" direction="in" />
    <arg type="i" name="w" direction="in" />
    <arg type="i" name="h" direction="in" />
  </method>
  <method name="SetRelativeSpotRect">
    <arg type="i" name="x" direction="in" />
    <arg type="i" name="y" direction="in" />
    <arg type="i" name="w" direction="in" />
    <arg type="i" name="h" direction="in" />
  </method>
  <method name="SetRelativeSpotRectV2">
    <arg type="i" name="x" direction="in" />
    <arg type="i" name="y" direction="in" />
    <arg type="i" name="w" direction="in" />
    <arg type="i" name="h" direction="in" />
    <arg type="d" name="scale" direction="in" />
  </method>
  <method name="SetLookupTable">
    <arg direction="in" type="as" name="label"/>
    <arg direction="in" type="as" name="text"/>
    <arg direction="in" type="as" name="attr"/>
    <arg direction="in" type="b" name="hasPrev"/>
    <arg direction="in" type="b" name="hasNext"/>
    <arg direction="in" type="i" name="cursor"/>
    <arg direction="in" type="i" name="layout"/>
  </method>
</interface>
</node>`;

const HelperIface = `<node>
<interface name="org.fcitx.GnomeHelper">
  <method name="LockXkbGroup">
    <arg direction="in" type="i" name="idx"/>
  </method>
  </interface>
</node>`;

export const Kimpanel = GObject.registerClass(
  class Kimpanel extends GObject.Object implements IKimPanel {
    // begin-remove
    private _helperImpl: Gio.DBusExportedObject | null;
    private _impl: Gio.DBusExportedObject | null;
    private _impl2: Gio.DBusExportedObject | null;
    private _isDestroyed: boolean;

    public aux: string;
    public conn: Gio.DBusConnection | null;
    public current_service: string;
    public cursor: number;
    public dbusSignal: number;
    public enabled: boolean;
    public fontSignal: number;
    public h: number;
    public helper_owner_id: number;
    public indicator: typeof KimIndicator.prototype | null;
    public inputpanel: typeof InputPanel.prototype | null;
    public keyboard: typeof Keyboard.prototype | null;
    public label: string[];
    public layoutHint: number;
    public menu: typeof KimMenu.prototype | null;
    public owner_id: number;
    public pos: number;
    public preedit: string;
    public relative: boolean;
    public scale: number;
    public settings: Gio.Settings | null;
    public showAux: boolean;
    public showLookupTable: boolean;
    public showPreedit: boolean;
    public table: string[];
    public verticalSignal: number;
    public w: number;
    public watch_id: number;
    public x: number;
    public y: number;

    // end-remove
    constructor(settings: Gio.Settings, dir: Gio.File) {
      super();

      this._isDestroyed = false;
      this.resetData();
      this.conn = Gio.bus_get_sync(Gio.BusType.SESSION, null);
      this.settings = settings;
      this._impl = Gio.DBusExportedObject.wrapJSObject(KimpanelIface, this);
      this._impl.export(Gio.DBus.session, "/org/kde/impanel");
      this._impl2 = Gio.DBusExportedObject.wrapJSObject(Kimpanel2Iface, this);
      this._impl2.export(Gio.DBus.session, "/org/kde/impanel");
      this._helperImpl = Gio.DBusExportedObject.wrapJSObject(HelperIface, this);
      this._helperImpl.export(Gio.DBus.session, "/org/fcitx/GnomeHelper");
      this.current_service = "";
      this.watch_id = 0;
      this.indicator = new KimIndicator({ kimpanel: this });
      this.inputpanel = new InputPanel({ kimpanel: this });
      this.keyboard = new Keyboard(this, dir);
      this.menu = new KimMenu({ sourceActor: this.indicator, kimpanel: this });

      this.verticalSignal = this.settings.connect("changed::vertical", () =>
        this.inputpanel?.setVertical(this.isLookupTableVertical())
      );

      this.fontSignal = this.settings.connect("changed::font", () =>
        this.inputpanel?.updateFont(this.getTextStyle())
      );

      this.addToShell();
      this.dbusSignal = this.conn.signal_subscribe(
        null,
        KIMPANEL_INTERFACE_INPUTMETHOD,
        null,
        null,
        null,
        Gio.DBusSignalFlags.NONE,
        this._parseSignal.bind(this)
      );
      this.owner_id = Gio.bus_own_name(
        Gio.BusType.SESSION,
        "org.kde.impanel",
        Gio.BusNameOwnerFlags.NONE,
        null,
        () => this.requestNameFinished(),
        null
      );
      this.helper_owner_id = Gio.bus_own_name(
        Gio.BusType.SESSION,
        "org.fcitx.GnomeHelper",
        Gio.BusNameOwnerFlags.NONE,
        null,
        null,
        null
      );
    }

    _parseSignal(
      _conn: Gio.DBusConnection,
      sender: string | null,
      _object: string,
      _iface: string,
      signal: string,
      param: GLib.Variant
    ) {
      if (this._isDestroyed) {
        return;
      }
      let changed = false;
      switch (signal) {
        case "ExecMenu": {
          const [value] = param.deepUnpack<[string[]]>();

          this.menu?.execMenu(value);
          break;
        }
        case "RegisterProperties": {
          const [value] = param.deepUnpack<[string[]]>();

          if (sender != null && this.current_service !== sender) {
            this.current_service = sender;
            if (this.watch_id !== 0) {
              Gio.bus_unwatch_name(this.watch_id);
            }
            this.watch_id = Gio.bus_watch_name(
              Gio.BusType.SESSION,
              this.current_service,
              Gio.BusNameWatcherFlags.NONE,
              null,
              this.imExit.bind(this)
            );
          }
          this.indicator?._updateProperties(value);
          break;
        }
        case "UpdateProperty": {
          const [value] = param.deepUnpack<[string]>();

          this.indicator?._updateProperty(value);
          this.keyboard?.updateProperty(value);
          if (this.enabled) this.indicator?._active();
          else this.indicator?._deactive();
          break;
        }
        case "UpdateSpotLocation": {
          const value = param.deepUnpack<[number, number]>();

          if (
            this.x !== value[0] ||
            this.y !== value[1] ||
            this.w !== 0 ||
            this.h !== 0
          )
            changed = true;
          this.x = value[0];
          this.y = value[1];
          this.w = 0;
          this.h = 0;
          break;
        }
        case "UpdatePreeditText": {
          const value = param.deepUnpack<[string, string]>();

          if (this.preedit !== value[0]) changed = true;
          this.preedit = value[0];
          break;
        }
        case "UpdateAux": {
          const value = param.deepUnpack<[string, string]>();

          if (this.aux !== value[0]) changed = true;
          this.aux = value[0];
          break;
        }
        case "UpdateLookupTableCursor": {
          const [value] = param.deepUnpack<[number]>();

          if (this.pos !== value) changed = true;
          this.cursor = value;
          break;
        }
        case "UpdatePreeditCaret": {
          const [value] = (param as GLib.Variant).deepUnpack<[number]>();

          if (this.pos !== value) changed = true;
          this.pos = value;
          break;
        }
        case "ShowPreedit": {
          const [value] = param.deepUnpack<[boolean]>();

          if (this.showPreedit !== value) changed = true;
          this.showPreedit = value;
          break;
        }
        case "ShowLookupTable": {
          if (this.keyboard?.visible()) return;

          const [value] = param.deepUnpack<[boolean]>();

          if (this.showLookupTable !== value) changed = true;
          this.showLookupTable = value;
          break;
        }
        case "ShowAux": {
          if (this.keyboard?.visible()) return;

          const [value] = param.deepUnpack<[boolean]>();

          if (this.showAux !== value) changed = true;
          this.showAux = value;
          break;
        }
        case "Enable": {
          const [value] = param.deepUnpack<[boolean]>();

          this.enabled = value;
          if (this.enabled) this.indicator?._active();
          else this.indicator?._deactive();
          break;
        }
      }
      if (changed) this.updateInputPanel();
    }

    resetData() {
      this.preedit = "";
      this.aux = "";
      this.layoutHint = 0;
      this.x = 0;
      this.y = 0;
      this.w = 0;
      this.h = 0;
      this.relative = false;
      this.scale = 1;
      this.table = [];
      this.label = [];
      this.pos = 0;
      this.cursor = -1;
      this.showPreedit = false;
      this.showLookupTable = false;
      this.showAux = false;
      this.enabled = false;
    }

    imExit(_conn: Gio.DBusConnection, name: string) {
      if (this.current_service === name) {
        this.current_service = "";
        if (this.watch_id !== 0) {
          Gio.bus_unwatch_name(this.watch_id);
          this.watch_id = 0;
        }

        this.resetData();
        this.indicator?._updateProperties([]);
        this.updateInputPanel();
      }
    }

    requestNameFinished() {
      if (this._isDestroyed) {
        return;
      }
      this._impl?.emit_signal("PanelCreated", null);
      this._impl2?.emit_signal("PanelCreated2", null);
    }

    isLookupTableVertical() {
      return this.layoutHint === 0
        ? Lib.isLookupTableVertical(this.settings)
        : this.layoutHint === 1;
    }

    getTextStyle() {
      return Lib.getTextStyle(this.settings);
    }

    destroy() {
      this._isDestroyed = true;
      this.resetData();
      this.updateInputPanel();
      if (this.watch_id !== 0) {
        Gio.bus_unwatch_name(this.watch_id);
        this.watch_id = 0;
        this.current_service = "";
      }
      this.settings?.disconnect(this.verticalSignal);
      this.settings?.disconnect(this.fontSignal);
      this.settings = null;
      this.conn?.signal_unsubscribe(this.dbusSignal);
      this.conn = null;
      Gio.bus_unown_name(this.owner_id);
      Gio.bus_unown_name(this.helper_owner_id);
      this._impl?.unexport();
      this._impl = null;
      this._impl2?.unexport();
      this._impl2 = null;
      this._helperImpl?.unexport();
      this._helperImpl = null;
      // Menu need to be destroyed before indicator.
      this.menu?.destroy();
      this.menu = null;
      this.indicator?.destroy();
      this.indicator = null;
      this.inputpanel?.destroy();
      this.inputpanel = null;
      this.keyboard?.destroy();
      this.keyboard = null;
    }

    addToShell() {
      if (this.menu != null) Main.uiGroup.add_child(this.menu.actor);
      this.menu?.actor.hide();

      if (this.inputpanel?.panel != null)
        Main.layoutManager.addChrome(this.inputpanel.panel, {});

      if (this.inputpanel?._cursor != null)
        Main.uiGroup.add_child(this.inputpanel._cursor);

      if (this.indicator != null)
        Main.panel.addToStatusArea("kimpanel", this.indicator);
    }

    toggleIM(): void {
      this.conn?.call(
        FCITX_BUS_NAME,
        FCITX_CONTROLLER_OBJECT_PATH,
        FCITX_INTERFACE_CONTROLLER,
        "Toggle",
        null,
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null
      );
    }

    updateInputPanel(): void {
      const inputpanel = this.inputpanel;

      this.showAux ? inputpanel?.setAuxText(this.aux) : inputpanel?.hideAux();
      this.showPreedit
        ? inputpanel?.setPreeditText(this.preedit, this.pos)
        : inputpanel?.hidePreedit();

      this.inputpanel?.setLookupTable(
        this.label,
        this.table,
        this.showLookupTable
      );
      this.inputpanel?.setLookupTableCursor(this.cursor);
      this.inputpanel?.updatePosition();
    }

    emit(signal: string) {
      this._impl?.emit_signal(signal, null);
    }

    triggerProperty(arg: string): void {
      this._impl?.emit_signal(
        "TriggerProperty",
        new GLib.Variant("(s)", [arg])
      );
    }

    selectCandidate(arg: number): void {
      this._impl?.emit_signal(
        "SelectCandidate",
        new GLib.Variant("(i)", [arg])
      );
    }

    setRect(
      x: number,
      y: number,
      w: number,
      h: number,
      relative: boolean,
      scale: number
    ) {
      if (
        this.x === x &&
        this.y === y &&
        this.w === w &&
        this.h === h &&
        this.relative === relative &&
        this.scale === scale
      ) {
        return;
      }
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.relative = relative;
      this.scale = scale;
      this.updateInputPanel();
    }

    SetSpotRect(x: number, y: number, w: number, h: number) {
      this.setRect(x, y, w, h, false, 1);
    }

    SetRelativeSpotRect(x: number, y: number, w: number, h: number) {
      this.setRect(x, y, w, h, true, 1);
    }

    SetRelativeSpotRectV2(
      x: number,
      y: number,
      w: number,
      h: number,
      scale: number
    ) {
      this.setRect(x, y, w, h, true, scale);
    }

    SetLookupTable(
      labels: string[],
      texts: string[],
      _attrs: string[],
      hasPrev: boolean,
      hasNext: boolean,
      cursor: number,
      layout: number
    ) {
      if (this.keyboard?.visible() && hasPrev) {
        this.label.push(...labels);
        this.table.push(...texts);
        this.cursor = cursor;
        this.layoutHint = layout;
      } else {
        this.label = labels;
        this.table = texts;
        this.cursor = cursor;
        this.layoutHint = layout;
      }

      this.inputpanel?.setVertical(this.isLookupTableVertical());
      this.updateInputPanel();

      if (this.keyboard?.visible()) {
        if (hasNext) {
          this._impl?.emit_signal("LookupTablePageDown", null);
        } else {
          this.keyboard?.setSuggestions(this.label, this.table);
        }
      }
    }

    LockXkbGroup(idx: number) {
      Meta.get_backend().lock_layout_group(idx);
    }
  }
);
