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
