export type DisplayDirty = {
	aux?: boolean;
	lookupCursor?: boolean;
	lookupTable?: boolean;
	position?: boolean;
	preedit?: boolean;
};

export type SpotRect = {
	h: number;
	relative: boolean;
	scale: number;
	w: number;
	x: number;
	y: number;
};

/** Preedit, aux, spot, and visibility for the current IM session. */
export class InputState {
	public aux = "";
	public enabled = false;
	public h = 0;
	public pos = 0;
	public preedit = "";
	public relative = false;
	public scale = 1;
	public showAux = false;
	public showLookupTable = false;
	public showPreedit = false;
	public w = 0;
	public x = 0;
	public y = 0;

	public reset(): void {
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

	public setAux(text: string): DisplayDirty | null {
		if (this.aux === text) return null;
		this.aux = text;
		return { aux: true, position: true };
	}

	public setCaret(pos: number): DisplayDirty | null {
		if (this.pos === pos) return null;
		this.pos = pos;
		return { preedit: true };
	}

	public setEnabled(enabled: boolean): boolean {
		if (this.enabled === enabled) return false;
		this.enabled = enabled;
		return true;
	}

	public setPreedit(text: string): DisplayDirty | null {
		if (this.preedit === text) return null;
		this.preedit = text;
		return { position: true, preedit: true };
	}

	public setRect(
		x: number,
		y: number,
		w: number,
		h: number,
		relative: boolean,
		scale: number,
	): DisplayDirty | null {
		if (
			this.x === x &&
			this.y === y &&
			this.w === w &&
			this.h === h &&
			this.relative === relative &&
			this.scale === scale
		) {
			return null;
		}
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
		this.relative = relative;
		this.scale = scale;
		return { position: true };
	}

	public setShowAux(visible: boolean): DisplayDirty | null {
		if (this.showAux === visible) return null;
		this.showAux = visible;
		return { aux: true, position: true };
	}

	public setShowLookupTable(visible: boolean): DisplayDirty | null {
		if (this.showLookupTable === visible) return null;
		this.showLookupTable = visible;
		return {
			lookupCursor: true,
			lookupTable: true,
			position: true,
		};
	}

	public setShowPreedit(visible: boolean): DisplayDirty | null {
		if (this.showPreedit === visible) return null;
		this.showPreedit = visible;
		return { position: true, preedit: true };
	}

	public setSpotLocation(x: number, y: number): DisplayDirty | null {
		if (this.x === x && this.y === y && this.w === 0 && this.h === 0)
			return null;
		this.x = x;
		this.y = y;
		this.w = 0;
		this.h = 0;
		return { position: true };
	}

	public spot(): SpotRect {
		return {
			h: this.h,
			relative: this.relative,
			scale: this.scale,
			w: this.w,
			x: this.x,
			y: this.y,
		};
	}
}
