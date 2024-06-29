declare module "resource:///org/gnome/shell/extensions/extension.js" {
  type CreateOverrideFunc<T> = (originalMethod: T) => T;

  class InjectionManager {
    clear(): void;

    overrideMethod<T, U extends keyof T>(
      prototype: T,
      methodName: U,
      createOverrideFunc: CreateOverrideFunc<T<U>>
    ): void;

    restoreMethod<T, U extends keyof T>(prototype: T, methodName: U): void;
  }
}

declare module "resource:///org/gnome/shell/ui/boxpointer.js" {
  import type * as BoxPointerBase from "@girs/gnome-shell/ui/boxpointer";

  class BoxPointer extends BoxPointerBase.BoxPointer {
    close(
      animate: BoxPointerBase.PopupAnimation,
      onComplete?: () => void
    ): void;

    open(animate: BoxPointerBase.PopupAnimation, onComplete?: () => void): void;
  }
}

declare module "resource:///org/gnome/shell/ui/status/keyboard.js" {
  import type * as Signals from "@girs/gnome-shell/misc/signals";
  import type * as InputSourceManagerBase from "@girs/gnome-shell/ui/status/keyboard";
  import type IBus from "@girs/ibus-1.0";
  import type Meta from "@girs/meta-14";

  class InputSourceManager extends Signals.EventEmitter {
    activeInputSource(
      is: InputSourceManagerBase.InputSource,
      inactive: boolean
    );
    void;

    reload(): void;

    _currentInputMethodSourceChanged(
      newSource: InputSourceManagerBase.InputSource
    ): void;

    _ibusPropertiesRegistered(im, engineName: string, pr): void;

    _ibusPropertyUpdated(im, engineName: string, props): void;

    _ibusReadyCallback(im, ready: boolean): void;

    _inputSourcesChanged(): void;

    _keyboardModelChanged(): void;

    _keyboardOptionsChanged(): void;

    _makeEngineShortName(engineDesc: IBus.EngineDesc): string;

    _modifiersSwitcher(): void;

    _switchInputSource(
      display: Meta.Display,
      window: Meta.Window,
      binding: Meta.KeyBinding
    ): void;

    _updateMruSettings(): void;

    _updateMruSources(): void;
  }
}

declare module "resource:///org/gnome/shell/ui/keyboard.js" {
  import type * as Signals from "@girs/gnome-shell/misc/signals";
  import type * as InputSourceManager from "resource:///org/gnome/shell/ui/status/keyboard.js";
  import type Clutter from "@girs/clutter-14";
  import type Graphene from "@girs/graphene-1.0";
  import type Meta from "@girs/meta-14";
  import type Mtk from "@girs/mtk-14";
  import type St from "@girs/st-14";

  interface FocusTracker extends Signals.EventEmitter {
    get currentWindow(): Meta.Window;

    destroy(): void;

    getCurrentRect(): Mtk.Rectangle;

    _setCurrentRect(rect: Graphene.Rect): void;

    _setCurrentWindow(window: Meta.Window): void;
  }

  interface KeyContainer extends St.Widget {
    mode: string;
    shiftKeys: unknown[];

    appendKey(key, width = 1, height = 1, leftOffset = 0): void;

    appendRow(): void;

    getRatio(): [number, number];
  }

  interface KeyboardController extends Signals.EventEmitter {
    set oskCompletion(enabled: boolean);

    commit(str: string, modifiers: string[]): Promise<void>;

    destroy(): void;

    getCurrentGroup(): string;

    keyvalPress(keyval: string): void;

    keyvalRelease(keyval: string): void;

    toggleDelete(enabled: boolean): void;

    _forwardModifiers(modifies: string[], type: Clutter.EventType): void;

    _getKeyvalsFromString(string: string): void;

    _onContentHintsChanged(method: Clutter.InputMethod): void;

    _onPurposeHintsChanged(method: Clutter.InputMethod): void;

    _onSourceChanged(
      inputSourceManager: InputSourceManager.InputSourceManager,
      _oldSource: InputSourceManager.InputSource
    ): void;

    _onSourceModified(): void;

    _previousWordPosition(text: string, cursor: number): number;
  }

  class Keyboard extends St.BoxLayout {
    _aspectContainer: KeyContainer | null;
    _contentHint: number;
    _currentLayout: Clutter.Actor | null;
    _keyboardController: KeyboardController;
    _layers: Record<number | string, unknown> | null;
    _latched: boolean;
    _longPressed: boolean;
    _modifierKeys: Record<string, Key[]>;
    _modifiers: string[];

    get visible(): boolean;

    set visible(visible: boolean);

    addSuggestion(text: string, callback: () => void): void;

    close(immediate = false): void;

    gestureActive(): void;

    gestureCancel(): void;

    gestureProgress(delta: number): void;

    open(immediate = false): void;

    resetSuggestions(): void;

    setCursorLocation(
      window: Meta.Window,
      x: number,
      y: number,
      w: number,
      h: number
    ): void;

    setSuggestionVisible(visible: boolean): void;

    _init(): void;

    _addRowKeys(keys: Key[], layout: KeyContainer, emojiVisible: boolean): void;

    _animateHide(): void;

    _animateHideComplete(): void;

    _animateShow(): void;

    _animateShowComplete(): void;

    _animateWindow(window: Meta.Window, show: boolean): void;

    _clearKeyboardRestTimer(): void;

    _cleatShowIdle(): void;

    _close();

    _disableAllModifiers(): void;

    _getGridSlots(): [number, number];

    _onContentHintChanged(controller: KeyboardController, contentHint: number);

    _onDestroy(): void;

    _onFocusPositionChanged(focusTracker: FocusTracker): void;

    _onFocusWindowMoving(): void;

    _onGroupChanged(): void;

    _onKeyboardStateChanged(
      controller: KeyboardController,
      state: Clutter.InputPanelState
    ): void;

    _onKeyFocusChanged();

    _onPurposeChanged(
      _controller: KeyboardController,
      purpose: Clutter.InputContentPurpose
    ): void;

    _open(): void;

    _popupLanguageMenu(keyActor: Clutter.Actor): void;

    _relayout(): void;

    _setActiveLevel(activeLevel: number | string): void;

    _setCurrentLevelLatched(layout: Clutter.Actor, latched: boolean);

    _setEmojiActive(active: boolean): void;

    _setFocusWindow(window: Meta.Window);
    void;

    _setLatched(latched: boolean): void;

    _setModifierEnabled(keyval: string, enabled: boolean);

    _setupKeyboard(): void;

    _toggleEmoji(): void;

    _toggleModifier(keyval: string);

    _updateCurrentPageVisible(): void;

    _updateKeys(): void;

    _updateLayout(
      groupName: string,
      purpose: Clutter.InputContentPurpose
    ): void;

    _updateLayoutFromHint(): void;

    _updateLevelFromHints(): void;

    _windowSlideAnimationComplete(window: Meta.Window, finalY: number): void;
  }

  class KeyboardManager extends Signals.EventEmitter {
    get keyboardActor();

    get visible();

    addSuggestion(text: string, callback);

    close();

    maybeHandleEvent(event: Clutter.Event);

    open(monitor: number);

    resetSuggestions();

    setSuggestionsVisible(visible: boolean);

    _lastDeviceIsTouchscreen();

    _syncEnabled();
  }
}
