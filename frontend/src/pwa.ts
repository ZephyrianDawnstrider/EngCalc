import { registerSW } from "virtual:pwa-register";

export const PWA_APP_VERSION = __ENGCALC_APP_VERSION__;

export interface PwaState {
  installAvailable: boolean;
  updateAvailable: boolean;
  offlineReady: boolean;
}

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type InstallResult = "accepted" | "dismissed" | "unavailable";
type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

const listeners = new Set<(state: PwaState) => void>();
let state: PwaState = {
  installAvailable: false,
  updateAvailable: false,
  offlineReady: false,
};
let started = false;
let installPrompt: InstallPrompt | null = null;
let updateServiceWorker: UpdateServiceWorker | null = null;

function publish(update: Partial<PwaState>): void {
  state = { ...state, ...update };
  for (const listener of listeners) listener({ ...state });
}

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    publish({ installAvailable: true });
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    publish({ installAvailable: false });
  });

  if (!("serviceWorker" in navigator)) return;

  updateServiceWorker = registerSW({
    immediate: true,
    onOfflineReady() {
      publish({ offlineReady: true });
    },
    onNeedRefresh() {
      publish({ updateAvailable: true });
    },
    onNeedReload() {
      // vite-plugin-pwa otherwise reloads when the accepted worker takes
      // control. Keep the current form and report snapshot in this session.
    },
    onRegisterError() {
      publish({ offlineReady: false });
    },
  });
}

/** Subscribe to browser install, shell-cache, and waiting-update availability. */
export function subscribePwaState(listener: (value: PwaState) => void): () => void {
  listeners.add(listener);
  listener({ ...state });
  start();
  return () => listeners.delete(listener);
}

/** Show the native install prompt only after Chromium/browser exposes it. */
export async function requestInstall(): Promise<InstallResult> {
  const prompt = installPrompt;
  if (!prompt) return "unavailable";

  installPrompt = null;
  publish({ installAvailable: false });
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

/**
 * Accept a waiting worker without reloading or claiming the current clients.
 * The open calculator session keeps its loaded code; the next navigation uses
 * the new shell. Saved report snapshots are never read or rewritten here.
 */
export function activateUpdateForNextNavigation(): void {
  if (!updateServiceWorker) return;
  void updateServiceWorker().then(() => {
    publish({ updateAvailable: false });
  }).catch(() => {
    // Keep the update notice visible so the user can retry later.
  });
}
