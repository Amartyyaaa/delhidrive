// Post-build fixes for static hosts that cannot rewrite URLs.
//
// GitHub Pages has no rewrite rules: a request for /delhidrive/fleet looks for
// a real file at that path, finds nothing, and serves 404.html. By making
// 404.html a copy of index.html, the app boots anyway and React Router reads
// the URL and renders the right page. Netlify and Vercel use their own config
// files, so this is harmless there.

import { copyFileSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('[postbuild] dist/index.html not found — did the build run?');
  process.exit(1);
}

copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));

// Stops GitHub Pages running the output through Jekyll, which would silently
// drop any file or folder whose name begins with an underscore.
writeFileSync(join(dist, '.nojekyll'), '');

console.log('[postbuild] wrote dist/404.html and dist/.nojekyll');

// ---------------------------------------------------------------------
// Pages that are shared as links
// ---------------------------------------------------------------------
// /host-your-car is sent to car owners on WhatsApp. Through the 404.html
// fallback above it opens fine in a browser, but the server's answer is
// "404 Not Found" — so WhatsApp shows no preview card and search engines
// skip it. GitHub Pages serves foo.html at /foo, so writing a real file gives
// the address a proper 200, with its own title, description and preview image.
// The file is the same app shell: React Router still renders the page.

const site = (
  process.env.VITE_SITE_URL ||
  (existsSync(join(dist, 'CNAME')) ? `https://${readFileSync(join(dist, 'CNAME'), 'utf8').trim()}` : 'https://delhidrive.in')
).replace(/\/+$/, '');

const SHARED_PAGES = [
  {
    path: 'host-your-car',
    title: 'Host your car · DelhiDrive',
    description:
      'List your car on DelhiDrive. Send us its details, RC, insurance and photos — once our team approves it, it goes live for renters across Delhi NCR.',
    image: 'og-host-your-car.jpg',
  },
];

const shell = readFileSync(join(dist, 'index.html'), 'utf8');
const attr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

for (const page of SHARED_PAGES) {
  const url = `${site}/${page.path}`;
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="DelhiDrive" />`,
    `<meta property="og:title" content="${attr(page.title)}" />`,
    `<meta property="og:description" content="${attr(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${site}/${page.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');

  const html = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(page.title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${attr(page.description)}" />`
    )
    .replace('</head>', `  ${tags}\n  </head>`);

  if (!html.includes(page.title) || !html.includes('og:image')) {
    console.error(`[postbuild] could not prepare ${page.path}.html — has index.html changed shape?`);
    process.exit(1);
  }

  // Both spellings of the address: /host-your-car and /host-your-car/
  writeFileSync(join(dist, `${page.path}.html`), html);
  mkdirSync(join(dist, page.path), { recursive: true });
  writeFileSync(join(dist, page.path, 'index.html'), html);
  console.log(`[postbuild] wrote dist/${page.path}.html for ${url}`);
}
