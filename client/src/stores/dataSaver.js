import { create } from 'zustand';

const KEY = 'chatify:data-saver';

function read() {
  try {
    const value = globalThis.localStorage?.getItem(KEY);
    return value === 'on' ? true : value === 'off' ? false : null;
  } catch {
    return null;
  }
}

/** The browser's own "reduce data usage" hint, used until the person chooses. */
export function browserPrefersSavingData() {
  return globalThis.navigator?.connection?.saveData === true;
}

/**
 * Data saver mode: photos are not downloaded until tapped. null means "no choice yet", which
 * follows the browser's data-saving hint; true and false are the person's explicit choice.
 */
export const useDataSaver = create((set) => ({
  choice: read(),
  set: (enabled) => {
    try {
      globalThis.localStorage?.setItem(KEY, enabled ? 'on' : 'off');
    } catch {
      // Without storage the choice lasts for this visit only.
    }
    set({ choice: enabled });
  },
}));

export function isSavingData(choice) {
  return choice ?? browserPrefersSavingData();
}
