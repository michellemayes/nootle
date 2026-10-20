// Shared notes open light like a document; a reader who picks dark gets it
// back on their next visit. The choice lives on <html> so it applies before
// React loads, with no light flash first.

export const THEME_KEY = "nootle-share-theme";
export const THEME_ATTR = "data-share-theme";

/** Runs inline before the page paints. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.setAttribute("${THEME_ATTR}","dark")}catch(e){}`;
