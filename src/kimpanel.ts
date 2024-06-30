import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { KimIndicator } from "./indicator.js";
import { Keyboard } from "./keyboard.js";
import * as Lib from "./lib.js";
import { KimMenu } from "./menu.js";
import { InputPanel } from "./panel.js";
import { SuggestionsManager } from "./suggestions.js";
import type { IKimPanel } from "./types/kimpanel.js";

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
		public aux!: string;
		public conn: Gio.DBusConnection | null;
		public current_service: string;
		public dbusSignal: number;
		public enabled!: boolean;
		public fontSignal: number;
		public h!: number;
		public helper_owner_id: number;
		public indicator: typeof KimIndicator.prototype | null;
		public keyboard: typeof Keyboard.prototype | null;
		public menu: typeof KimMenu.prototype | null;
		public owner_id: number;
		public pos!: number;
		public preedit!: string;
		public relative!: boolean;
		public scale!: number;
		public settings: Gio.Settings | null;
		public showAux!: boolean;
		public showLookupTable!: boolean;
		public showPreedit!: boolean;
		public verticalSignal: number;
		public w!: number;
		public watch_id: number;
		public x!: number;
		public y!: number;

		private helperImpl: Gio.DBusExportedObject | null;
		private impl: Gio.DBusExportedObject | null;
		private impl2: Gio.DBusExportedObject | null;
		private inputPanel: typeof InputPanel.prototype | null;
		private isDestroyed: boolean;
		private suggestionsManager: SuggestionsManager | null;
		// end-remove
		constructor(settings: Gio.Settings, dir: Gio.File) {
			super();

			this.isDestroyed = false;
			this.resetData();
			this.conn = Gio.bus_get_sync(Gio.BusType.SESSION, null);
			this.settings = settings;
			this.impl = Gio.DBusExportedObject.wrapJSObject(KimpanelIface, this);
			this.impl.export(Gio.DBus.session, "/org/kde/impanel");
			this.impl2 = Gio.DBusExportedObject.wrapJSObject(Kimpanel2Iface, this);
			this.impl2.export(Gio.DBus.session, "/org/kde/impanel");
			this.helperImpl = Gio.DBusExportedObject.wrapJSObject(HelperIface, this);
			this.helperImpl.export(Gio.DBus.session, "/org/fcitx/GnomeHelper");
			this.suggestionsManager = new SuggestionsManager(this);
			this.current_service = "";
			this.watch_id = 0;
			this.indicator = new KimIndicator({ kimpanel: this });
			this.inputPanel = new InputPanel({ kimpanel: this });
			this.keyboard = new Keyboard(this, dir);
			this.menu = new KimMenu({ kimpanel: this, sourceActor: this.indicator });

			this.verticalSignal = this.settings.connect("changed::vertical", () =>
				this.inputPanel?.setVertical(this.isLookupTableVertical()),
			);

			this.fontSignal = this.settings.connect("changed::font", () =>
				this.inputPanel?.updateFont(this.getTextStyle()),
			);

			this.addToShell();
			this.dbusSignal = this.conn.signal_subscribe(
				null,
				KIMPANEL_INTERFACE_INPUTMETHOD,
				null,
				null,
				null,
				Gio.DBusSignalFlags.NONE,
				this.parseSignal.bind(this),
			);
			this.owner_id = Gio.bus_own_name(
				Gio.BusType.SESSION,
				"org.kde.impanel",
				Gio.BusNameOwnerFlags.NONE,
				null,
				() => this.requestNameFinished(),
				null,
			);
			this.helper_owner_id = Gio.bus_own_name(
				Gio.BusType.SESSION,
				"org.fcitx.GnomeHelper",
				Gio.BusNameOwnerFlags.NONE,
				null,
				null,
				null,
			);
		}

		LockXkbGroup(idx: number) {
			new Meta.Context().get_backend().lock_layout_group(idx);
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
			this.suggestionsManager?.setLookupTable(
				labels,
				texts,
				attrs,
				hasPrev,
				hasNext,
				cursor,
				layout,
			);

			if (Lib.keyboardIsVisible()) {
				if (this.suggestionsManager != null)
					this.keyboard?.setSuggestions(this.suggestionsManager.allTexts);
			} else {
				this.inputPanel?.setVertical(this.isLookupTableVertical());
				this.updateInputPanel();
			}
		}

		SetRelativeSpotRect(x: number, y: number, w: number, h: number): void {
			this.setRect(x, y, w, h, true, 1);
		}

		SetRelativeSpotRectV2(
			x: number,
			y: number,
			w: number,
			h: number,
			scale: number,
		): void {
			this.setRect(x, y, w, h, true, scale);
		}

		SetSpotRect(x: number, y: number, w: number, h: number): void {
			this.setRect(x, y, w, h, false, 1);
		}

		public destroy(): void {
			this.isDestroyed = true;
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
			this.impl?.unexport();
			this.impl = null;
			this.impl2?.unexport();
			this.impl2 = null;
			this.helperImpl?.unexport();
			this.helperImpl = null;
			this.suggestionsManager = null;
			// Menu need to be destroyed before indicator.
			this.menu?.destroy();
			this.menu = null;
			this.indicator?.destroy();
			this.indicator = null;
			this.inputPanel?.destroy();
			this.inputPanel = null;
			this.keyboard?.destroy();
			this.keyboard = null;
		}

		public emit(signal: string): void {
			this.impl?.emit_signal(signal, null);
		}

		public getTextStyle(): string {
			return Lib.getTextStyle(this.settings);
		}

		public isLookupTableVertical(): boolean {
			return this.suggestionsManager?.layoutHint === 0
				? Lib.isLookupTableVertical(this.settings)
				: this.suggestionsManager?.layoutHint === 1;
		}

		public lookupPageDown(): void {
			this.impl?.emit_signal("LookupTablePageDown", null);
		}

		public lookupPageUp(): void {
			this.impl?.emit_signal("LookupTablePageUp", null);
		}

		public selectCandidate(arg: number): void {
			this.impl?.emit_signal("SelectCandidate", new GLib.Variant("(i)", [arg]));
			this.suggestionsManager?.reset();
			Main.keyboard.resetSuggestions();
		}

		public selectCandidateText(arg: string): void {
			this.suggestionsManager?.selectCandidate(arg);
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

		public triggerProperty(arg: string): void {
			this.impl?.emit_signal("TriggerProperty", new GLib.Variant("(s)", [arg]));
		}

		private addToShell(): void {
			if (this.menu != null) Main.uiGroup.add_child(this.menu.actor);
			this.menu?.actor.hide();

			if (this.inputPanel?.panel != null)
				Main.layoutManager.addChrome(this.inputPanel.panel, {});

			if (this.inputPanel?.cursor != null)
				Main.uiGroup.add_child(this.inputPanel.cursor);

			if (this.indicator != null)
				Main.panel.addToStatusArea("kimpanel", this.indicator);
		}

		private imExit(_conn: Gio.DBusConnection, name: string): void {
			if (this.current_service === name) {
				this.current_service = "";
				if (this.watch_id !== 0) {
					Gio.bus_unwatch_name(this.watch_id);
					this.watch_id = 0;
				}

				this.resetData();
				this.indicator?.updateProperties([]);
				this.updateInputPanel();
			}
		}

		private parseSignal(
			_conn: Gio.DBusConnection,
			sender: string | null,
			_object: string,
			_iface: string,
			signal: string,
			param: GLib.Variant,
		): void {
			if (this.isDestroyed) {
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
							this.imExit.bind(this),
						);
					}
					this.indicator?.updateProperties(value);
					break;
				}
				case "UpdateProperty": {
					const [value] = param.deepUnpack<[string]>();

					this.indicator?.updateProperty(value);
					this.keyboard?.updateProperty(value);
					if (this.enabled) this.indicator?.active();
					else this.indicator?.deactive();
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
					if (this.suggestionsManager) this.suggestionsManager.cursor = value;
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
					const [value] = param.deepUnpack<[boolean]>();

					if (this.showLookupTable !== value) changed = true;
					this.showLookupTable = value;
					break;
				}
				case "ShowAux": {
					const [value] = param.deepUnpack<[boolean]>();

					if (this.showAux !== value) changed = true;
					this.showAux = value;
					break;
				}
				case "Enable": {
					const [value] = param.deepUnpack<[boolean]>();

					this.enabled = value;
					if (this.enabled) this.indicator?.active();
					else this.indicator?.deactive();
					break;
				}
			}
			if (changed) this.updateInputPanel();
		}

		private requestNameFinished(): void {
			if (this.isDestroyed) {
				return;
			}
			this.impl?.emit_signal("PanelCreated", null);
			this.impl2?.emit_signal("PanelCreated2", null);
		}

		private resetData(): void {
			this.preedit = "";
			this.aux = "";
			this.x = 0;
			this.y = 0;
			this.w = 0;
			this.h = 0;
			this.relative = false;
			this.scale = 1;
			this.pos = 0;
			this.showPreedit = false;
			this.showLookupTable = false;
			this.showAux = false;
			this.enabled = false;
		}

		private setRect(
			x: number,
			y: number,
			w: number,
			h: number,
			relative: boolean,
			scale: number,
		): void {
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

		private updateInputPanel(): void {
			if (Lib.keyboardIsVisible()) return;

			if (this.showAux) {
				this.inputPanel?.setAuxText(this.aux);
			} else {
				this.inputPanel?.hideAux();
			}
			if (this.showPreedit) {
				this.inputPanel?.setPreeditText(this.preedit, this.pos);
			} else {
				this.inputPanel?.hidePreedit();
			}

			this.inputPanel?.setLookupTable(
				this.suggestionsManager?.labels ?? [],
				this.suggestionsManager?.texts ?? [],
				this.showLookupTable,
			);

			this.inputPanel?.setLookupTableCursor(
				this.suggestionsManager?.cursor ?? -1,
			);

			this.inputPanel?.updatePosition();
		}
	},
);
