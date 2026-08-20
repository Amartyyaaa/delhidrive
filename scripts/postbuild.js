// Post-build fixes for static hosts that cannot rewrite URLs.
//
// GitHub Pages has no rewrite rules: a request for /delhidrive/fleet looks for
// a real file at that path, finds nothing, and serves 404.html. By making
// 404.html a copy of index.html, the app boots anyway and React Router reads
// the URL and renders the right page. Netlify and Vercel use their own config
// files, so this is harmless there.

import { copyFileSync, writeFileSync, existsSync } from 'node:fs';
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
