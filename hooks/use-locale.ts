"use client";

import { useCallback, useEffect, useState } from "react";

export type Locale = "en" | "th";

const STORAGE_KEY = "scg-thaisec.locale";

function readInitial(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "th" ? "th" : "en";
}

/**
 * Reads and writes the user's preferred UI locale to localStorage. The default
 * is "en" per the brief. SSR-safe: returns "en" on the server, hydrates from
 * storage on mount, and emits a `storage` event so multiple components on the
 * page stay in sync without a context provider.
 */
export function useLocale(): [Locale, (next: Locale) => void] {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(readInitial());
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && (e.newValue === "en" || e.newValue === "th")) {
        setLocale(e.newValue);
      }
    }
    function onCustom() {
      setLocale(readInitial());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("scg-thaisec:locale-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("scg-thaisec:locale-change", onCustom);
    };
  }, []);

  const update = useCallback((next: Locale) => {
    setLocale(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event("scg-thaisec:locale-change"));
  }, []);

  return [locale, update];
}
