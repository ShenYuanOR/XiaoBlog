import { loadConfig } from '../lib/config';
import { withBase } from '../lib/base';

export function GET() {
  const config = loadConfig();
  const sitemap = new URL(withBase('sitemap-index.xml'), config.site.url).href;
  const body = config.seo.noindex
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
