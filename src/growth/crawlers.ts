export function robotsText(origin:string):string {
  const blocked=['/api/','/account','/sign-in','/sign-up','/me/','/moderate/'];
  const rules=blocked.map(path=>`Disallow: ${path}`).join('\n');
  const discover=['Googlebot','Bingbot','Applebot','OAI-SearchBot','ChatGPT-User','PerplexityBot'];
  return `User-agent: *\nAllow: /\n${rules}\n\n${discover.map(bot=>`User-agent: ${bot}\nAllow: /\n${rules}\n`).join('\n')}\n${['Bytespider','CCBot','Diffbot'].map(bot=>`User-agent: ${bot}\nDisallow: /api/\n`).join('\n')}\nSitemap: ${origin}/sitemap.xml\n`;
}
