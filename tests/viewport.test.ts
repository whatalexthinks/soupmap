import test from "node:test";
import assert from "node:assert/strict";
import { sheetHeights } from "../src/ui/viewport.ts";

test("sheet snaps fit short, notched and keyboard-reduced visible viewports",()=>{
  for(const height of [150,300,390,568,667,874]) {
    for(const safe of [0,34]) {
      const sizes=sheetHeights(height,62,34,safe);
      assert.ok(sizes.peek>=0);
      assert.ok(sizes.peek<=sizes.half);
      assert.ok(sizes.half<=sizes.full);
      assert.ok(sizes.full<=height-62-34-safe);
    }
  }
});
