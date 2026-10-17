import { test } from "node:test";
import assert from "node:assert/strict";
import { Cartographic, Math as CesiumMath, type Viewer } from "cesium";
import { CameraDirector, PLANET_HEIGHT, INTRO_HOLD_MS, INTRO_FLIGHT_SECONDS, INTRO_APPROACH_SECONDS, INTRO_APPROACH_HEIGHT } from "../src/map/camera.ts";
import { cityBySlug } from "../src/data/cities.ts";
import { STARTUP_CITY_SLUG } from "../src/startup.ts";

const tokyo = cityBySlug.get(STARTUP_CITY_SLUG)!;
function mockViewer() {
  const views: any[] = [], flights: any[] = [];
  let cancellations = 0;
  const viewer = {
    camera:{
      setView:(options:unknown)=>views.push(options),
      cancelFlight:()=>{cancellations++;},
      flyTo:(options:any)=>{flights.push(options);options.complete();},
      flyToBoundingSphere:(sphere:any,options:any)=>{flights.push({sphere,...options});options.complete();},
    },
    scene:{requestRender(){},canvas:{clientWidth:1200,clientHeight:800}},
  } as unknown as Viewer;
  return {viewer,views,flights,get cancellations(){return cancellations;}};
}

test("the test destination is Tokyo, not a guessed visitor location",()=>{
  assert.equal(STARTUP_CITY_SLUG,"tokyo");
  assert.equal(tokyo.name,"Tokyo");
});

test("opening starts with the entire planet, holds it, then flies into Tokyo",async context=>{
  context.mock.timers.enable({apis:["setTimeout"]});
  const mock=mockViewer();
  const director=new CameraDirector(mock.viewer,false,()=>[],tokyo);
  const opening=director.intro(tokyo);
  assert.equal(mock.views.length,1);
  const point=Cartographic.fromCartesian(mock.views[0].destination);
  assert.ok(Math.abs(point.height-PLANET_HEIGHT)<1);
  assert.ok(Math.abs(CesiumMath.toDegrees(point.longitude)-tokyo.lng)<0.00001);
  assert.equal(mock.views[0].orientation.pitch,-Math.PI/2);
  assert.equal(mock.flights.length,0);
  context.mock.timers.tick(INTRO_HOLD_MS);
  await opening;
  assert.equal(mock.flights.length,2);
  assert.equal(mock.flights[0].duration,INTRO_APPROACH_SECONDS);
  assert.ok(Math.abs(Cartographic.fromCartesian(mock.flights[0].destination).height-INTRO_APPROACH_HEIGHT)<1);
  assert.equal(mock.flights[1].duration,INTRO_FLIGHT_SECONDS-INTRO_APPROACH_SECONDS);
  const destination=Cartographic.fromCartesian(mock.flights[1].sphere.center);
  assert.ok(Math.abs(CesiumMath.toDegrees(destination.latitude)-tokyo.lat)<0.00001);
});

test("touching the map during the opening hold prevents a later automatic flight",async context=>{
  context.mock.timers.enable({apis:["setTimeout"]});
  const mock=mockViewer();
  const director=new CameraDirector(mock.viewer,false);
  const opening=director.intro(tokyo);
  director.cancel();
  await opening;
  context.mock.timers.tick(INTRO_HOLD_MS+100);
  assert.equal(mock.flights.length,0);
});

test("choosing another city interrupts the intro without snapping back to Tokyo",async()=>{
  const mock=mockViewer();
  const director=new CameraDirector(mock.viewer,false);
  const opening=director.intro(tokyo);
  await director.city(cityBySlug.get("kyoto")!,1);
  await opening;
  assert.equal(mock.flights.length,1);
  const destination=Cartographic.fromCartesian(mock.flights[0].sphere.center);
  assert.ok(Math.abs(CesiumMath.toDegrees(destination.longitude)-cityBySlug.get("kyoto")!.lng)<0.00001);
});

test("reduced motion skips the long opening and frames the destination immediately",async()=>{
  const mock=mockViewer();
  await new CameraDirector(mock.viewer,true).intro(tokyo);
  assert.equal(mock.views.length,0);
  assert.equal(mock.flights.length,1);
  assert.equal(mock.flights[0].duration,0);
});

test("the overview control returns to the planet rather than a Japan-only frame",async()=>{
  const mock=mockViewer();
  await new CameraDirector(mock.viewer,false,()=>[],tokyo).overview(0);
  assert.equal(mock.views.length,1);
  const point=Cartographic.fromCartesian(mock.views[0].destination);
  assert.ok(point.height>20_000_000);
  assert.equal(mock.flights.length,0);
});

test("interrupting the regional approach cannot start a second city flight",async context=>{
  context.mock.timers.enable({apis:["setTimeout"]});
  const mock=mockViewer();
  let finish:()=>void=()=>{};
  mock.viewer.camera.flyTo=((options:any)=>{mock.flights.push(options);finish=options.cancel;}) as any;
  const director=new CameraDirector(mock.viewer,false);
  const opening=director.intro(tokyo);
  context.mock.timers.tick(INTRO_HOLD_MS);
  await Promise.resolve();
  assert.equal(mock.flights.length,1);
  director.cancel();finish();
  await opening;
  assert.equal(mock.flights.length,1);
});
