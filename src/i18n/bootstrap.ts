/**
 * Startup wiring for localization. Imported once from the root layout, before anything renders text.
 *
 * Zustand's persisted prefs hydrate from AsyncStorage asynchronously, so the saved language is not
 * available synchronously at launch. Rather than render English and correct it a frame later, this
 * applies the stored choice the moment hydration finishes — which happens while the launch reveal is
 * still covering the screen — and then keeps i18next in step with the store for every later change.
 */
import { usePrefsStore } from "../store/prefs.store";
import { initI18n, isSupported, setLanguage } from "./index";

// Start on the device locale so no text is ever blank.
initI18n();

function apply(code: string | null | undefined): void {
  if (isSupported(code)) setLanguage(code);
}

if (usePrefsStore.persist.hasHydrated()) apply(usePrefsStore.getState().language);
else usePrefsStore.persist.onFinishHydration((state) => apply(state?.language));

// Every later change to the preference (the picker in Profile) flows through here too, so the picker
// only has to store the choice.
usePrefsStore.subscribe((state) => apply(state.language));
