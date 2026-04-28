import { useEffect } from 'react';

const SUFFIX = ' | AdorAPP';

/**
 * Sets document.title on mount and resets it on unmount. Use one per page.
 *
 * `useDocumentTitle('Repertorio')` → tab reads "Repertorio | AdorAPP".
 * Pass a falsy value (undefined / null) to skip — the previous title stays.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title + SUFFIX;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
