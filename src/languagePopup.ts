import Clutter from "gi://Clutter";
import St from "gi://St";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import type * as KeyboardBase from "resource:///org/gnome/shell/ui/keyboard.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as InputSourceManager from "resource:///org/gnome/shell/ui/status/keyboard.js";

class LanguageSelectionPopup extends PopupMenu.PopupMenu {
	private capturedPress: boolean;
	private sourceMappedId: number;
	private stageCaptureEventId: number;

	constructor(sourceActor: Clutter.Actor) {
		super(sourceActor, 0.5, St.Side.BOTTOM);
		this.capturedPress = false;
		this.sourceMappedId = 0;
		this.stageCaptureEventId = 0;

		const inputSourceManager = InputSourceManager.getInputSourceManager();
		const inputSources = inputSourceManager.inputSources;

		for (const i in inputSources) {
			const is = inputSources[i];

			const item = this.addAction(is.displayName, () => {
				inputSourceManager.activateInputSource(is, true);
			});
			item.can_focus = false;
			item.setOrnament(
				is === inputSourceManager.currentSource
					? PopupMenu.Ornament.DOT
					: PopupMenu.Ornament.NO_DOT,
			);
		}

		this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		const item = this.addSettingsAction(
			_("Keyboard Settings"),
			"gnome-keyboard-panel.desktop",
		);
		item.can_focus = false;

		this.sourceMappedId = sourceActor.connect("notify::mapped", () => {
			if (!sourceActor.is_mapped()) this.close(BoxPointer.PopupAnimation.FULL);
		});
	}

	public _onCapturedEvent(_actor: Clutter.Actor, event: Clutter.Event) {
		const type = event.type();
		const press =
			type === Clutter.EventType.BUTTON_PRESS ||
			type === Clutter.EventType.TOUCH_BEGIN;
		const release =
			type === Clutter.EventType.BUTTON_RELEASE ||
			type === Clutter.EventType.TOUCH_END;
		const targetActor = global.stage.get_event_actor(event);

		if (
			targetActor &&
			(targetActor === this.actor || this.actor.contains(targetActor))
		)
			return Clutter.EVENT_PROPAGATE;

		if (press) this.capturedPress = true;
		else if (release && this.capturedPress) {
			this.close(BoxPointer.PopupAnimation.FULL);
		}
		return Clutter.EVENT_STOP;
	}

	public close(animate?: BoxPointer.PopupAnimation) {
		super.close(animate);
		this.capturedPress = false;
		if (this.stageCaptureEventId !== 0) {
			global.stage.disconnect(this.stageCaptureEventId);
			this.stageCaptureEventId = 0;
		}
	}

	public destroy() {
		if (this.stageCaptureEventId !== 0) {
			global.stage.disconnect(this.stageCaptureEventId);
			this.stageCaptureEventId = 0;
		}
		if (this.sourceMappedId !== 0) {
			this.sourceActor.disconnect(this.sourceMappedId);
			this.sourceMappedId = 0;
		}
		super.destroy();
	}

	public open(animate?: BoxPointer.PopupAnimation) {
		super.open(animate);
		if (this.stageCaptureEventId !== 0) {
			global.stage.disconnect(this.stageCaptureEventId);
		}
		this.stageCaptureEventId = global.stage.connect(
			"captured-event",
			this._onCapturedEvent.bind(this),
		);
	}
}

export const overridePopupLanguageMenu = (
	_originalMethod: typeof KeyboardBase.Keyboard.prototype._popupLanguageMenu,
): typeof KeyboardBase.Keyboard.prototype._popupLanguageMenu => {
	return function (this: KeyboardBase.Keyboard, keyActor) {
		if (!(keyActor instanceof Clutter.Actor)) return;
		if (this.__kimpanelLanguagePopup) this.__kimpanelLanguagePopup.destroy();

		const popup = new LanguageSelectionPopup(keyActor);
		this.__kimpanelLanguagePopup = popup;
		Main.layoutManager.addTopChrome(popup.actor);
		popup.open(BoxPointer.PopupAnimation.FULL);
	};
};
