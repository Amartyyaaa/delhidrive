// Turn private file references into links a screen can show.

import { useEffect, useMemo, useState } from 'react';
import { privateFileUrls } from './db';

// On the local store a "reference" is the whole image inlined, so compare
// references by their length and both ends rather than by the full text.
const fingerprint = (ref) => `${ref.length}:${ref.slice(0, 24)}:${ref.slice(-40)}`;

/**
 * @param {string[]} refs  "bucket:key" references (see uploadPrivateFile)
 * @returns {Object} { ref: url } — a reference with no entry cannot be opened
 *                   by this account, or its link is still on the way.
 */
export function useFileUrls(refs) {
  const list = useMemo(() => [...new Set((refs || []).filter(Boolean))], [refs]);
  const key = list.map(fingerprint).sort().join('|');
  const [urls, setUrls] = useState({});

  useEffect(() => {
    if (!list.length) {
      setUrls({});
      return undefined;
    }
    let live = true;
    const load = () =>
      privateFileUrls(list)
        .then((map) => live && setUrls(map))
        .catch(() => {});
    load();
    // The links last an hour; ask again before then so an open screen keeps working.
    const timer = setInterval(load, 45 * 60 * 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return urls;
}

/**
 * Open a file in a new tab. On the local store a file is an inlined data: URL,
 * which browsers refuse to open as a page — so hand it over as a blob instead.
 * Call it straight from a click, or the new tab is blocked as a pop-up.
 */
export function openFile(url) {
  if (!url) return;
  let target = url;
  if (/^data:/i.test(url)) {
    const [head, body] = url.split(',');
    const mime = (head.match(/^data:([^;,]+)/i)?.[1] || '').toLowerCase();
    // A blob opened from here runs as this site. Pictures and PDFs cannot run
    // anything; a page or an SVG could, so nothing else is ever opened.
    if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(mime)) return;
    const binary = atob(body || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    target = URL.createObjectURL(new Blob([bytes], { type: mime }));
  }
  const tab = window.open(target, '_blank');
  if (tab) tab.opener = null;
}
