import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { KimIndicator } from "./indicator.js";
import type { DisplayDirty } from "./inputState.js";
import { InputState } from "./inputState.js";
import { Keyboard } from "./keyboard.js";
import {
	KimpanelDBus,
	type KimpanelDBusHost,
	type KimpanelDBusListener,
} from "./kimpanelDbus.js";
import * as Lib from "./lib.js";
import { KimMenu } from "./menu.js";
import { InputPanel } from "./panel.js";
import { SuggestionsManager } from "./suggestions.js";
import type { IKimPanel } from "./types/kimpanel.js";

export const Kimpanel = GObject.registerClass(
	class Kimpanel
		extends GObject.Object
		implements IKimPanel, KimpanelDBusHost, KimpanelDBusListener
	{
		declare public indicator: null | typeof KimIndicator.prototype;
		declare public keyboard: null | typeof Keyboard.prototype;
		declare public menu: null | typeof KimMenu.prototype;
		declare public oskSuggestionsFontSignal: number;
		declare public panelFontSignal: number;
		declare public panelVerticalSignal: number;
		declare public settings: Gio.Settings | null;

		declare private dbus: null | typeof KimpanelDBus.prototype;
		declare private inputPanel: null | typeof InputPanel.prototype;
		declare private state: InputState;
		declare private suggestionsManager: null | SuggestionsManager;

		constructor(settings: Gio.Settings, dir: Gio.File) {
			super();

			this.state = new InputState();
			this.settings = settings;
			this.suggestionsManager = new SuggestionsManager(this);
			this.indicator = new KimIndicator({ kimpanel: this });
			this.inputPanel = new InputPanel({ kimpanel: this });
			this.keyboard = new Keyboard(this, dir);
			this.menu = new KimMenu({ kimpanel: this, sourceActor: this.indicator });

			this.panelVerticalSignal = this.settings.connect(
				"changed::panel-vertical",
				() => {
					this.inputPanel?.setOrientation(this.getLookupTableOrientation());
					this.inputPanel?.updatePosition(
						this.state.spot(),
						this.state.showAux ||
							this.state.showPreedit ||
							this.state.showLookupTable,
					);
				},
			);

			this.panelFontSignal = this.settings.connect(
				"changed::panel-font",
				() => {
					this.inputPanel?.updateFont(this.getPanelTextStyle());
				},
			);

			this.oskSuggestionsFontSignal = this.settings.connect(
				"changed::osk-suggestions-font",
				() => {
					this.keyboard?.updateFont(this.getOskSuggestionsTextStyle());
				},
			);

			this.addToShell();
			this.dbus = new KimpanelDBus(this, this);
		}

		public destroy(): void {
			this.dbus?.destroy();
			this.dbus = null;
			this.state.reset();
			this.updateDisplay();
			this.settings?.disconnect(this.panelVerticalSignal);
			this.settings?.disconnect(this.panelFontSignal);
			this.settings?.disconnect(this.oskSuggestionsFontSignal);
			this.settings = null;
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
			this.dbus?.emit(signal);
		}

		public getLookupTableOrientation(): Clutter.Orientation {
			if (this.suggestionsManager?.layoutHint === 1)
				return Clutter.Orientation.VERTICAL;
			return Lib.getLookupTableOrientation(this.settings);
		}

		public getOskSuggestionsTextStyle(): string {
			return Lib.getOskSuggestionsTextStyle(this.settings);
		}

		public getPanelTextStyle(): string {
			return Lib.getPanelTextStyle(this.settings);
		}

		public lockXkbGroup(idx: number): void {
			global.backend.lock_layout_group(idx);
		}

		public lookupPageDown(): void {
			this.dbus?.lookupPageDown();
		}

		public lookupPageUp(): void {
			this.dbus?.lookupPageUp();
		}

		public onEnable(enabled: boolean): void {
			this.state.setEnabled(enabled);
			if (this.state.enabled) this.indicator?.active();
			else this.indicator?.deactive();
		}

		public onExecMenu(properties: string[]): void {
			this.menu?.execMenu(properties);
		}

		public onImExit(): void {
			this.state.reset();
			this.indicator?.updateProperties([]);
			this.updateDisplay();
		}

		public onRegisterProperties(properties: string[]): void {
			this.indicator?.updateProperties(properties);
			if (this.state.enabled) this.indicator?.active();
		}

		public onShowAux(visible: boolean): void {
			this.applyDisplayDirty(this.state.setShowAux(visible));
		}

		public onShowLookupTable(visible: boolean): void {
			this.applyDisplayDirty(this.state.setShowLookupTable(visible));
		}

		public onShowPreedit(visible: boolean): void {
			this.applyDisplayDirty(this.state.setShowPreedit(visible));
		}

		public onUpdateAux(text: string): void {
			this.applyDisplayDirty(this.state.setAux(text));
		}

		public onUpdateLookupTableCursor(cursor: number): void {
			if (this.suggestionsManager == null) return;
			if (this.suggestionsManager.cursor === cursor) return;
			this.suggestionsManager.cursor = cursor;
			this.updateDisplay({ lookupCursor: true });
		}

		public onUpdatePreeditCaret(pos: number): void {
			this.applyDisplayDirty(this.state.setCaret(pos));
		}

		public onUpdatePreeditText(text: string): void {
			this.applyDisplayDirty(this.state.setPreedit(text));
		}

		public onUpdateProperty(value: string): void {
			this.indicator?.updateProperty(value);
			this.keyboard?.updateProperty(value);
			if (this.state.enabled) this.indicator?.active();
			else this.indicator?.deactive();
		}

		public onUpdateSpotLocation(x: number, y: number): void {
			this.applyDisplayDirty(this.state.setSpotLocation(x, y));
		}

		public selectCandidate(arg: number): void {
			this.dbus?.selectCandidate(arg);
			this.suggestionsManager?.reset();
			Main.keyboard.resetSuggestions();
		}

		public selectCandidateText(arg: string): void {
			this.suggestionsManager?.selectCandidate(arg);
		}

		public setLookupTable(
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
			this.updateDisplay({
				lookupCursor: true,
				lookupTable: true,
				position: true,
			});
		}

		public setSpotRect(
			x: number,
			y: number,
			w: number,
			h: number,
			relative: boolean,
			scale: number,
		): void {
			this.applyDisplayDirty(this.state.setRect(x, y, w, h, relative, scale));
		}

		public toggleIM(): void {
			this.dbus?.toggleIM();
		}

		public triggerProperty(arg: string): void {
			this.dbus?.triggerProperty(arg);
		}

		private addToShell(): void {
			if (this.menu != null)
				Main.layoutManager.uiGroup.add_child(this.menu.actor);
			this.menu?.actor.hide();

			if (this.inputPanel?.panel != null)
				Main.layoutManager.addChrome(this.inputPanel.panel, {});

			if (this.inputPanel?.cursor != null)
				Main.layoutManager.uiGroup.add_child(this.inputPanel.cursor);

			if (this.indicator != null)
				Main.panel.addToStatusArea("kimpanel", this.indicator);
		}

		private applyDisplayDirty(dirty: DisplayDirty | null): void {
			if (dirty != null) this.updateDisplay(dirty);
		}

		private renderOsk(flags?: DisplayDirty): void {
			if (flags?.lookupTable !== true) return;
			if (this.suggestionsManager == null) return;
			if (!this.suggestionsManager.advanceOsk()) return;
			this.keyboard?.setSuggestions(this.suggestionsManager.allTexts);
		}

		private renderPanel(flags?: DisplayDirty): void {
			const all = flags == null;

			if (all || flags.aux) {
				if (this.state.showAux) this.inputPanel?.setAuxText(this.state.aux);
				else this.inputPanel?.hideAux();
			} else if (!this.state.showAux) {
				this.inputPanel?.hideAux();
			}

			if (all || flags.preedit) {
				if (this.state.showPreedit)
					this.inputPanel?.setPreeditText(this.state.preedit, this.state.pos);
				else this.inputPanel?.hidePreedit();
			} else if (!this.state.showPreedit) {
				this.inputPanel?.hidePreedit();
			}

			if (all || flags.lookupTable) {
				this.inputPanel?.setOrientation(this.getLookupTableOrientation());
				this.inputPanel?.setLookupTable(
					this.suggestionsManager?.labels ?? [],
					this.suggestionsManager?.texts ?? [],
					this.state.showLookupTable,
				);
			} else if (!this.state.showLookupTable) {
				this.inputPanel?.hideLookup();
			}

			if (all || flags.lookupTable || flags.lookupCursor) {
				this.inputPanel?.setLookupTableCursor(
					this.suggestionsManager?.cursor ?? -1,
				);
			}

			if (all || flags.position) {
				this.inputPanel?.updatePosition(
					this.state.spot(),
					this.state.showAux ||
						this.state.showPreedit ||
						this.state.showLookupTable,
				);
			}
		}

		private updateDisplay(flags?: DisplayDirty): void {
			if (Lib.keyboardIsVisible()) this.renderOsk(flags);
			else this.renderPanel(flags);
		}
	},
);
