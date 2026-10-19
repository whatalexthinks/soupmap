import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { MapControls } from "../src/ui/controls.ts";

test("map mode badges stay removed while fallback controls, notices and attribution work",async()=>{
  const window=new Window();
  const previous=Object.getOwnPropertyDescriptor(globalThis,"document");
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,"window");
  Object.defineProperty(globalThis,"document",{value:window.document,configurable:true});
  Object.defineProperty(globalThis,"window",{value:window,configurable:true});
  try {
    window.document.body.innerHTML=`
      <div id="controls">
        <button id="zoom-in"></button><button id="zoom-out"></button>
        <button id="north-btn"></button><button id="tilt-btn"></button>
        <button id="overview-btn"></button><button id="building-toggle"></button>
      </div>
      <div id="fallback-style"><button data-style="photo"></button><button data-style="map"></button></div>
      <div id="status-chip" role="status" hidden></div>
      <div id="credit-viewport">Google Maps attribution</div>`;
    const controls=new MapControls({
      onOverview(){},onZoom(){},onTilt(){return false;},onNorth(){},onBuildingToggle(){},onFallbackStyle(){},
    });
    const chip=window.document.getElementById("status-chip")!;
    const styles=window.document.getElementById("fallback-style")!;
    controls.setStatus({kind:"ready",mode:"google"});
    assert.equal(chip.hidden,true);
    assert.equal(chip.textContent,"");
    assert.equal(styles.hidden,true);
    controls.setStatus({kind:"ready",mode:"fallback",reason:"Unavailable"});
    assert.equal(chip.hidden,true);
    assert.equal(styles.hidden,false);
    controls.flash("Buildings unavailable",0);
    assert.equal(chip.hidden,false);
    assert.match(chip.textContent,/Buildings unavailable/);
    await new Promise(resolve=>window.setTimeout(resolve,10));
    assert.equal(chip.hidden,true);
    assert.equal(chip.textContent,"");
    assert.equal(window.document.getElementById("credit-viewport")!.textContent,"Google Maps attribution");
  } finally {
    await window.happyDOM.close();
    if(previous) Object.defineProperty(globalThis,"document",previous);
    else Reflect.deleteProperty(globalThis,"document");
    if(previousWindow) Object.defineProperty(globalThis,"window",previousWindow);
    else Reflect.deleteProperty(globalThis,"window");
  }
});
