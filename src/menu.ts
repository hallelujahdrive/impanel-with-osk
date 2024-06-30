import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Params from "resource:///org/gnome/shell/misc/params.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Lib from "./lib.js";
import type { IKimPanel } from "./types/kimpanel.js";
import type { MenuItemProperty } from "./types/menuItem.js";

export class KimMenu extends PopupMenu.PopupMenu {
	// begin-remove
	public grabbed: boolean;
	public kimpanel: IKimPanel | null;

	private enterEventId!: number;
	private eventCaptureId!: number;
	private keyFocusNotifyId!: number;
	private kimKeyPressId: number;
	private leaveEventId!: number;
	private openStateChangedId: number;
	private propertySwitch: (typeof Lib.KimMenuItem.prototype)[];
	// end-remove
	constructor(params: {
		arrowAlignment?: number;
		arrowSide?: St.Side;
		kimpanel: IKimPanel;
		sourceActor: St.Widget;
	}) {
		const _params = Params.parse(params, {
			arrowAlignment: 0.5,
			arrowSide: St.Side.TOP,
			kimpanel: null,
			sourceActor: null,
		});
		super(_params.sourceActor, _params.arrowAlignment, _params.arrowSide);
		this.openStateChangedId = this.connect(
			"open-state-changed",
			this.onOpenStateChanged.bind(this),
		);
		this.kimKeyPressId = this.actor.connect(
			"key-press-event",
			this.onSourceKeyPress.bind(this),
		);
		this.grabbed = false;
		this.propertySwitch = [];
		this.kimpanel = _params.kimpanel;
	}

	public destroy(): void {
		this.disconnect(this.openStateChangedId);
		this.actor.disconnect(this.kimKeyPressId);
		if (this.grabbed) {
			this.ungrab();
		}
		this.execMenu([]);
		this.kimpanel = null;
		super.destroy();
	}

	public execMenu(properties: string[]): void {
		for (const property of this.propertySwitch) {
			property.destroy();
		}
		this.propertySwitch = [];

		for (const property of properties) {
			const _property = Lib.parseProperty(property);
			this.addPropertyItem(_property);
		}
		if (properties.length > 0) {
			this.open(true);
		}
	}

	private addPropertyItem(property: MenuItemProperty) {
		const item = Lib.createMenuItem(property);

		item.menuItemActivateId = item.connect("activate", () =>
			this.kimpanel?.triggerProperty(item.key),
		);
		item.menuItemDestroyId = item.connect("destroy", () => {
			item.disconnect(item.menuItemActivateId);
			item.disconnect(item.menuItemDestroyId);
		});
		item.setIcon(property.icon);
		item.label.text = property.label;

		this.propertySwitch.push(item);
		this.addMenuItem(item);
	}

	private grab(): void {
		Main.pushModal(this.actor);

		this.eventCaptureId = global.stage.connect(
			"captured-event",
			this.onEventCapture.bind(this),
		);
		// captured-event doesn't see enter/leave events
		this.enterEventId = global.stage.connect(
			"enter-event",
			this.onHoverCapture.bind(this),
		);
		this.leaveEventId = global.stage.connect(
			"leave-event",
			this.onHoverCapture.bind(this),
		);
		this.keyFocusNotifyId = global.stage.connect(
			"notify::key-focus",
			this.onKeyFocusChanged.bind(this),
		);

		this.grabbed = true;
	}

	private onEventCapture(_actor: Clutter.Actor, event: Clutter.Event) {
		if (!this.grabbed) return false;

		const activeMenuContains = this.actor.contains(event.get_source());

		const eventType = event.type();
		if (eventType === Clutter.EventType.BUTTON_RELEASE) {
			if (activeMenuContains) {
				return false;
			}
			this.close(false);
			return true;
		}
		if (eventType === Clutter.EventType.BUTTON_PRESS && !activeMenuContains) {
			this.close(false);
			return true;
		}
		return false;
	}

	private onHoverCapture() {
		if (!this.grabbed) return false;

		return false;
	}

	private onKeyFocusChanged(): void {
		if (!this.grabbed) return;

		const focus = global.stage.key_focus;
		if (focus) {
			if (this.actor.contains(focus)) return;
		}

		this.close(false);
	}

	private onOpenStateChanged(_menu, open: boolean) {
		if (open) {
			if (!this.grabbed) this.grab();
		} else {
			if (this.grabbed) this.ungrab();
		}
		// Setting the max-height won't do any good if the minimum height of the
		// menu is higher then the screen; it's useful if part of the menu is
		// scrollable so the minimum height is smaller than the natural height
		const monitor = Main.layoutManager.primaryMonitor;
		if (monitor != null)
			this.actor.style = `max-height: ${Math.round(
				monitor.height - Main.panel.get_actor().height,
			)}px;`;
	}

	private onSourceKeyPress(_actor: Clutter.Actor, event: Clutter.Event) {
		const symbol = event.get_key_symbol();
		if (symbol === Clutter.KEY_space || symbol === Clutter.KEY_Return) {
			this.toggle();
			return true;
		}
		if (symbol === Clutter.KEY_Escape && this.isOpen) {
			this.close(false);
			return true;
		}
		if (symbol === Clutter.KEY_Down) {
			if (!this.isOpen) this.toggle();
			this.actor.navigate_focus(
				this.actor,
				St.DirectionType.TAB_FORWARD,
				false,
			);
			return true;
		}

		return false;
	}

	private ungrab() {
		global.stage.disconnect(this.eventCaptureId);
		this.eventCaptureId = 0;
		global.stage.disconnect(this.enterEventId);
		this.enterEventId = 0;
		global.stage.disconnect(this.leaveEventId);
		this.leaveEventId = 0;
		global.stage.disconnect(this.keyFocusNotifyId);
		this.keyFocusNotifyId = 0;
		this.grabbed = false;
		Main.popModal(this.actor);
	}
}
