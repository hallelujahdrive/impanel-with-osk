import type Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

/** The base padding of the keyboard. */
export const BASE_PADDING = 6 as const;

export function actorNaturalWidth(actor: Clutter.Actor): number {
	const [, nat] = actor.get_preferred_width(-1);
	return nat;
}

/**
 * Get the width of the keyboard content.
 * If the keyboard width is greater than 1, return the keyboard width.
 * If the keyboard width is 0, return the keyboard box width.
 * If the keyboard width is less than 1, return the maximum of the keyboard width and the keyboard box width.
 */
export function oskKeyboardContentWidth(): number {
	const keyboardWidth = Main.keyboard._keyboard?.width ?? 0;
	const boxWidth = Main.layoutManager.keyboardBox.width;
	if (keyboardWidth > 1) return keyboardWidth;
	if (boxWidth > 1) return boxWidth;
	return Math.max(keyboardWidth, boxWidth);
}
