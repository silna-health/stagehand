/**
 * Universal key mapping utility for converting various key representations
 * to Playwright-compatible key names. Used by all CUA clients and handlers.
 */

/**
 * map of key variations to Playwright key names
 * This handles keys from both Anthropic and OpenAI CUA APIs
 */
const KEY_MAP: Record<string, string> = {
  ENTER: "Enter",
  RETURN: "Enter",
  ESCAPE: "Escape",
  ESC: "Escape",
  BACKSPACE: "Backspace",
  TAB: "Tab",
  SPACE: " ",
  DELETE: "Delete",
  DEL: "Delete",
  ARROWUP: "ArrowUp",
  ARROWDOWN: "ArrowDown",
  ARROWLEFT: "ArrowLeft",
  ARROWRIGHT: "ArrowRight",
  ARROW_UP: "ArrowUp",
  ARROW_DOWN: "ArrowDown",
  ARROW_LEFT: "ArrowLeft",
  ARROW_RIGHT: "ArrowRight",
  UP: "ArrowUp",
  DOWN: "ArrowDown",
  LEFT: "ArrowLeft",
  RIGHT: "ArrowRight",
  SHIFT: "Shift",
  CONTROL: "Control",
  CTRL: "Control",
  ALT: "Alt",
  OPTION: "Alt", // macOS alternative name
  META: "Meta",
  COMMAND: "Meta", // macOS
  CMD: "Meta", // macOS shorthand
  SUPER: "Meta", // Linux
  WINDOWS: "Meta", // Windows
  WIN: "Meta", // Windows shorthand
  HOME: "Home",
  END: "End",
  PAGEUP: "PageUp",
  PAGEDOWN: "PageDown",
  PAGE_UP: "PageUp",
  PAGE_DOWN: "PageDown",
  PGUP: "PageUp",
  PGDN: "PageDown",
};

/**
 * Maps a key name from various formats to Playwright-compatible format
 * @param key The key name in any supported format
 * @returns The Playwright-compatible key name
 */
export function mapKeyToPlaywright(key: string): string {
  if (!key) return key;
  const upperKey = key.toUpperCase();
  return KEY_MAP[upperKey] || key;
}

/**
 * Browser history shortcuts, as sorted, lowercased Playwright key chords.
 * Chrome handles these in its UI layer, so dispatching them to the page as key
 * events never navigates.
 */
const HISTORY_SHORTCUTS: Record<string, "back" | "forward"> = {
  "alt+arrowleft": "back",
  "[+meta": "back",
  browserback: "back",
  "alt+arrowright": "forward",
  "]+meta": "forward",
  browserforward: "forward",
};

/**
 * Returns the history navigation a key chord would trigger in a real browser
 * ("back" / "forward"), or undefined for any other chord.
 * @param chord A "+"-delimited key combination, e.g. "Alt+ArrowLeft" or "alt+left"
 */
export function getHistoryShortcut(
  chord: string,
): "back" | "forward" | undefined {
  const normalized = chord
    .split("+")
    .filter(Boolean)
    .map((key) => mapKeyToPlaywright(key).toLowerCase())
    .sort()
    .join("+");
  return HISTORY_SHORTCUTS[normalized];
}
