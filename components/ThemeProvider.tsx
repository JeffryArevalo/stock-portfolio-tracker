"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";

type ThemeCtx = { dark: boolean; toggle: () => void };
const Ctx = createContext<ThemeCtx>({ dark: true, toggle: () => {} });

export function useTheme() {
  return useContext(Ctx);
}

/** Inline script that sets data-theme before first paint to avoid a flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("theme")||"dark";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

const THEME_EVENT = "theme-change";

function subscribe(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot() {
  return (localStorage.getItem("theme") || "dark") === "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, () => true);

  function toggle() {
    const next = dark ? "light" : "dark";
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return <Ctx.Provider value={{ dark, toggle }}>{children}</Ctx.Provider>;
}
