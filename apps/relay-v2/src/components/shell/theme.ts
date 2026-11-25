export type ThemePref = "dark" | "light" | "system";

export const THEME_KEY = "relay-theme";

export const resolveTheme = (pref: ThemePref, prefersDark: boolean): "dark" | "light" =>
  pref === "system" ? (prefersDark ? "dark" : "light") : pref;

export const themeBootScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"dark";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){document.documentElement.classList.add("dark")}})()`;
