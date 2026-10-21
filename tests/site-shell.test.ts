import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { renderSiteShell, siteHeader } from '../src/render/shell.ts';
import { catalogDocument, catalogPages } from '../src/render/catalog.ts';
import { journalBody, journalPages } from '../src/render/journal.ts';
import { loadJournal } from '../src/journal/load.ts';
import { loadRecipes } from '../src/recipes/load.ts';
import { recipePages, recipesBody } from '../src/render/recipes.ts';
import { CURATED_SHOPS } from '../src/data/shops.ts';
import { directoryState } from '../src/catalog/state.ts';

test('static and generated routes share one identity and all four destinations before hydration', async () => {
  const documents = ['index.html','map/index.html','me/index.html','account/index.html','credits/index.html','privacy/index.html','terms/index.html','moderate/index.html']
    .map(path => renderSiteShell(readFileSync(new URL(`../${path}`,import.meta.url),'utf8')));
  for (const page of catalogPages(CURATED_SHOPS)) documents.push(catalogDocument(page,'https://soupmap.example','/styles.css'));
  const articles = loadJournal();
  for (const page of journalPages(articles)) documents.push(journalBody(page));
  for (const page of recipePages(loadRecipes(new Set(articles.map(a => a.slug))))) documents.push(recipesBody(page));
  const window = new Window();
  try {
    for (const html of documents) {
      window.document.body.innerHTML = html;
      const nav = window.document.querySelectorAll('.site-nav');
      assert.equal(nav.length,1);
      assert.deepEqual([...nav[0]!.querySelectorAll('a')].map(a=>[a.getAttribute('href'),a.textContent]),[
        ['/catalog/','Discover'],['/map/','Map'],['/me/','Your Soupmap'],['/journal/','Journal'],['/recipes/','Recipes'],
      ]);
      const brand = window.document.querySelector('.site-header .site-brand');
      assert.equal(brand?.getAttribute('href'),'/');
      assert.equal(brand?.getAttribute('aria-label'),'Soupmap home');
      assert.equal(brand?.textContent,'soupmap.');
      assert.equal(brand?.querySelector('img')?.getAttribute('src'),'/brand-mark-black.png');
      assert.equal(window.document.querySelectorAll('#home-account, #directory-account, #map-account').length <= 1,true);
      assert.ok(!html.includes('<!--soupmap:header:'));
    }
    window.document.body.innerHTML = siteHeader('map');
    assert.equal(window.document.querySelector('.site-nav [aria-current=page]')?.getAttribute('href'),'/map/');
  } finally { await window.happyDOM.close(); }
});

test('homepage search feeds the directory query without needing a map or an account',async()=>{
  const window = new Window({url:'https://soupmap.example/'});
  try {
    window.document.write(renderSiteShell(readFileSync(new URL('../index.html',import.meta.url),'utf8')));
    const form=window.document.querySelector<HTMLFormElement>('.home-find')!;
    const input=form.querySelector<HTMLInputElement>('input')!;
    input.value='Kyoto miso';
    const destination=new URL(form.action);
    destination.search=new URLSearchParams({[input.name]:input.value}).toString();
    assert.equal(form.method,'get');
    assert.equal(destination.pathname,'/catalog/');
    assert.equal(directoryState(destination).query,'Kyoto miso');
  } finally { await window.happyDOM.close(); }
});
