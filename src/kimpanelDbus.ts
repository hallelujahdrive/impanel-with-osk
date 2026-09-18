import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

export type KimpanelDBusHost = {
	lockXkbGroup(idx: number): void;
	setLookupTable(
		labels: string[],
		texts: string[],
		attrs: string[],
		hasPrev: boolean,
		hasNext: boolean,
		cursor: number,
		layout: number,
	): void;
	setSpotRect(
		x: number,
		y: number,
		w: number,
		h: number,
		relative: boolean,
		scale: number,
	): void;
};

export type KimpanelDBusListener = {
	onEnable(enabled: boolean): void;
	onExecMenu(properties: string[]): void;
	onImExit(): void;
	onRegisterProperties(properties: string[]): void;
	onShowAux(visible: boolean): void;
	onShowLookupTable(visible: boolean): void;
	onShowPreedit(visible: boolean): void;
	onUpdateAux(text: string): void;
	onUpdateLookupTableCursor(cursor: number): void;
	onUpdatePreeditCaret(pos: number): void;
	onUpdatePreeditText(text: string): void;
	onUpdateProperty(value: string): void;
	onUpdateSpotLocation(x: number, y: number): void;
};

const EMPTY_TUPLE = new GLib.Variant("()", []);

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

const unpackBool = (param: GLib.Variant): boolean =>
	param.get_child_value(0).get_boolean();

const unpackInt = (param: GLib.Variant, index = 0): number =>
	param.get_child_value(index).get_int32();

const unpackStr = (param: GLib.Variant, index = 0): string =>
	param.get_child_value(index).unpack() as string;

/** Owns kimpanel D-Bus names, exports, and IM signal subscription. */
export const KimpanelDBus = GObject.registerClass(
	class KimpanelDBus extends GObject.Object {
		declare private conn: Gio.DBusConnection | null;
		declare private currentService: string;
		declare private dbusSignal: number;
		declare private helperImpl: Gio.DBusExportedObject | null;
		declare private helperOwnerId: number;
		declare private host: KimpanelDBusHost;
		declare private impl: Gio.DBusExportedObject | null;
		declare private impl2: Gio.DBusExportedObject | null;
		declare private isDestroyed: boolean;
		declare private listener: KimpanelDBusListener;
		declare private ownerId: number;
		declare private watchId: number;

		constructor(host: KimpanelDBusHost, listener: KimpanelDBusListener) {
			super();

			this.host = host;
			this.listener = listener;
			this.currentService = "";
			this.dbusSignal = 0;
			this.helperOwnerId = 0;
			this.isDestroyed = false;
			this.ownerId = 0;
			this.watchId = 0;
			this.conn = Gio.bus_get_sync(Gio.BusType.SESSION, null);
			this.impl = Gio.DBusExportedObject.wrapJSObject(KimpanelIface, this);
			this.impl.export(Gio.DBus.session, "/org/kde/impanel");
			this.impl2 = Gio.DBusExportedObject.wrapJSObject(Kimpanel2Iface, this);
			this.impl2.export(Gio.DBus.session, "/org/kde/impanel");
			this.helperImpl = Gio.DBusExportedObject.wrapJSObject(HelperIface, this);
			this.helperImpl.export(Gio.DBus.session, "/org/fcitx/GnomeHelper");

			this.dbusSignal = this.conn.signal_subscribe(
				null,
				KIMPANEL_INTERFACE_INPUTMETHOD,
				null,
				null,
				null,
				Gio.DBusSignalFlags.NONE,
				this.parseSignal.bind(this),
			);
			this.ownerId = Gio.bus_own_name(
				Gio.BusType.SESSION,
				"org.kde.impanel",
				Gio.BusNameOwnerFlags.NONE,
				null,
				() => this.requestNameFinished(),
				null,
			);
			this.helperOwnerId = Gio.bus_own_name(
				Gio.BusType.SESSION,
				"org.fcitx.GnomeHelper",
				Gio.BusNameOwnerFlags.NONE,
				null,
				null,
				null,
			);
		}

		public destroy(): void {
			this.isDestroyed = true;
			this.clearWatch();
			if (this.dbusSignal !== 0) {
				this.conn?.signal_unsubscribe(this.dbusSignal);
				this.dbusSignal = 0;
			}
			this.conn = null;
			if (this.ownerId !== 0) {
				Gio.bus_unown_name(this.ownerId);
				this.ownerId = 0;
			}
			if (this.helperOwnerId !== 0) {
				Gio.bus_unown_name(this.helperOwnerId);
				this.helperOwnerId = 0;
			}
			this.impl?.unexport();
			this.impl = null;
			this.impl2?.unexport();
			this.impl2 = null;
			this.helperImpl?.unexport();
			this.helperImpl = null;
		}

		public emit(signal: string): void {
			this.impl?.emit_signal(signal, EMPTY_TUPLE);
		}

		LockXkbGroup(idx: number) {
			this.host.lockXkbGroup(idx);
		}

		public lookupPageDown(): void {
			this.impl?.emit_signal("LookupTablePageDown", EMPTY_TUPLE);
		}

		public lookupPageUp(): void {
			this.impl?.emit_signal("LookupTablePageUp", EMPTY_TUPLE);
		}

		public selectCandidate(index: number): void {
			this.impl?.emit_signal(
				"SelectCandidate",
				new GLib.Variant("(i)", [index]),
			);
		}

		SetLookupTable(
			labels: string[],
			texts: string[],
			attrs: string[],
			hasPrev: boolean,
			hasNext: boolean,
			cursor: number,
			layout: number,
		): void {
			this.host.setLookupTable(
				labels,
				texts,
				attrs,
				hasPrev,
				hasNext,
				cursor,
				layout,
			);
		}

		SetRelativeSpotRect(x: number, y: number, w: number, h: number): void {
			this.host.setSpotRect(x, y, w, h, true, 1);
		}

		SetRelativeSpotRectV2(
			x: number,
			y: number,
			w: number,
			h: number,
			scale: number,
		): void {
			this.host.setSpotRect(x, y, w, h, true, scale);
		}

		SetSpotRect(x: number, y: number, w: number, h: number): void {
			this.host.setSpotRect(x, y, w, h, false, 1);
		}

		public toggleIM(): void {
			this.conn?.call(
				FCITX_BUS_NAME,
				FCITX_CONTROLLER_OBJECT_PATH,
				FCITX_INTERFACE_CONTROLLER,
				"Toggle",
				null,
				null,
				Gio.DBusCallFlags.NONE,
				-1,
				null,
			);
		}

		public triggerProperty(key: string): void {
			this.impl?.emit_signal("TriggerProperty", new GLib.Variant("(s)", [key]));
		}

		private clearWatch(): void {
			if (this.watchId === 0) return;
			Gio.bus_unwatch_name(this.watchId);
			this.watchId = 0;
			this.currentService = "";
		}

		private onImVanished(_conn: Gio.DBusConnection, name: string): void {
			if (this.currentService !== name) return;
			this.clearWatch();
			this.listener.onImExit();
		}

		private parseSignal(
			_conn: Gio.DBusConnection,
			sender: null | string,
			_object: string,
			_iface: string,
			signal: string,
			param: GLib.Variant,
		): void {
			if (this.isDestroyed) return;

			switch (signal) {
				case "Enable":
					this.listener.onEnable(unpackBool(param));
					return;
				case "ExecMenu": {
					const [value] = param.unpack() as [string[]];
					this.listener.onExecMenu(value);
					return;
				}
				case "RegisterProperties": {
					const [value] = param.unpack() as [string[]];
					this.watchSender(sender);
					this.listener.onRegisterProperties(value);
					return;
				}
				case "ShowAux":
					this.listener.onShowAux(unpackBool(param));
					return;
				case "ShowLookupTable":
					this.listener.onShowLookupTable(unpackBool(param));
					return;
				case "ShowPreedit":
					this.listener.onShowPreedit(unpackBool(param));
					return;
				case "UpdateAux":
					this.listener.onUpdateAux(unpackStr(param, 0));
					return;
				case "UpdateLookupTableCursor":
					this.listener.onUpdateLookupTableCursor(unpackInt(param));
					return;
				case "UpdatePreeditCaret":
					this.listener.onUpdatePreeditCaret(unpackInt(param));
					return;
				case "UpdatePreeditText":
					this.listener.onUpdatePreeditText(unpackStr(param, 0));
					return;
				case "UpdateProperty":
					this.listener.onUpdateProperty(unpackStr(param));
					return;
				case "UpdateSpotLocation":
					this.listener.onUpdateSpotLocation(
						unpackInt(param),
						unpackInt(param, 1),
					);
					return;
			}
		}

		private requestNameFinished(): void {
			if (this.isDestroyed) return;
			this.impl?.emit_signal("PanelCreated", EMPTY_TUPLE);
			this.impl2?.emit_signal("PanelCreated2", EMPTY_TUPLE);
		}

		private watchSender(sender: null | string): void {
			if (sender == null || this.currentService === sender) return;
			this.currentService = sender;
			if (this.watchId !== 0) Gio.bus_unwatch_name(this.watchId);
			this.watchId = Gio.bus_watch_name(
				Gio.BusType.SESSION,
				this.currentService,
				Gio.BusNameWatcherFlags.NONE,
				null,
				this.onImVanished.bind(this),
			);
		}
	},
);
