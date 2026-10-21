import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser=await chromium.launch({
  executablePath:process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium",
  headless:true,args:["--no-sandbox"],
});
const origin=`https://${process.env.REPLIT_DEV_DOMAIN}`;
try {
  for(const width of [390,1440]) {
    const page=await browser.newPage({viewport:{width,height:950}});
    await page.goto(`${origin}/catalog/`);
    await page.locator("[data-directory-save]").first().click();
    const prompt=page.locator("dialog.save-prompt[open]");
    await prompt.waitFor();
    assert.match(await prompt.innerText(),/email/i);
    const signup=new URL(await prompt.locator("a.save-prompt__signup").getAttribute("href"),origin);
    assert.equal(signup.pathname,"/sign-up");
    assert.match(signup.searchParams.get("redirect_url"),/^\/catalog\//);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await prompt.locator(".save-prompt__dismiss").click();
    await page.locator("[data-directory-save]").first().click();
    await prompt.waitFor();
    assert.equal(await page.locator("#save-prompt-title").count(),1);
    await page.keyboard.press("Escape");
    await page.waitForFunction(()=>!document.querySelector("dialog.save-prompt[open]"));
    assert.equal(await page.evaluate(()=>localStorage.getItem("soupmap:saved:v1")),null);
    await page.goto(`${origin}/recipes/miso-soup/`);
    await page.locator("#r-actions [data-action=save]").click();
    await prompt.waitFor();
    assert.match(await prompt.innerText(),/recipe/i);
    await page.keyboard.press("Escape");
    await page.locator("#r-notes button").click();
    await prompt.waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem("soupmap:recipes:saved:v1")),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem("soupmap:recipes:notes:v1")),null);
    await page.goto(`${origin}/me/#plan`);
    await page.locator("form[data-form=plan] button[type=submit]").click();
    await page.locator("[data-action=save-trip]").click();
    await prompt.waitFor();
    assert.match(await prompt.innerText(),/trip/i);
    assert.equal(await page.evaluate(()=>localStorage.getItem("soupmap:trips:v1")),null);
    console.log(`PASS ${width}px: directory, recipe, note and trip signup prompts; dismissal, safe return URLs and no device saves.`);
    await page.close();
  }
} finally {await browser.close();}
