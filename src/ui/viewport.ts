/** Geometry shared by the mobile dock, card and keyboard-aware viewport. */
export function sheetHeights(visibleHeight:number, header:number, credits:number, safeBottom:number, peek=72) {
  const full=Math.max(0,visibleHeight-header-credits-safeBottom-12);
  return {peek:Math.min(peek,full),half:visibleHeight<=500 ? full : Math.min(full,Math.max(peek,Math.round(visibleHeight*.52))),full};
}

export function updateViewport() {
  const root=document.documentElement;
  const visual=window.visualViewport;
  const height=visual?.height || window.innerHeight;
  const top=visual?.offsetTop || 0;
  const bottom=Math.max(0,window.innerHeight-height-top);
  const header=Math.max(0,(document.querySelector(".masthead")?.getBoundingClientRect().bottom ?? 64)-top);
  root.style.setProperty("--visible-height",`${height}px`);
  root.style.setProperty("--viewport-bottom",`${bottom}px`);
  root.style.setProperty("--masthead-height",`${header}px`);
  root.style.setProperty("--safe-bottom","env(safe-area-inset-bottom, 0px)");
  const css=getComputedStyle(root);
  return {height,bottom,header,safeBottom:parseFloat(css.getPropertyValue("--safe-bottom"))||0,credits:parseFloat(css.getPropertyValue("--credit-h"))||34,peek:parseFloat(css.getPropertyValue("--sheet-peek"))||72};
}
