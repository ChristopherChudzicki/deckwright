const KEY = "deckwright.lastProvider";
const LEGACY_KEY = "dndCards.lastProvider";

export function readLastProvider(): "google" | "github" {
  const v = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
  return v === "github" ? "github" : "google";
}

export function writeLastProvider(provider: "google" | "github"): void {
  window.localStorage.setItem(KEY, provider);
  window.localStorage.removeItem(LEGACY_KEY);
}

export function clearLastProvider(): void {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(LEGACY_KEY);
}
