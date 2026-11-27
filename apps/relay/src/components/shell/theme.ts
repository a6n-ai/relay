export type ThemePref = "dark" | "light" | "system";

export const THEME_KEY = "relay-theme";

export const resolveTheme = (pref: ThemePref, prefersDark: boolean): "dark" | "light" =>
  pref === "system" ? (prefersDark ? "dark" : "light") : pref;

export const themeBootScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=p==="light"?false:p==="system"?matchMedia("(prefers-color-scheme: dark)").matches:true;document.documentElement.classList.toggle("dark",d)}catch(e){document.documentElement.classList.add("dark")}})()`;
