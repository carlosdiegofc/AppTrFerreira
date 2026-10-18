// Light, dark or the computer's setting. Remembered per browser; the page still works when storage is blocked.
export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'trf-panel-tema';

export function savedTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    if (choice === 'auto') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    // Private windows may refuse storage: the choice lasts until the page is closed.
  }
}
