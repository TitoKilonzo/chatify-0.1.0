import { useEffect } from 'react';

const SUFFIX = 'Chatify';

/** Set the document title for a page, e.g. "About - Chatify". */
export function usePageTitle(title, separator = ' - ') {
  useEffect(() => {
    document.title = title
      ? `${title}${separator}${SUFFIX}`
      : `${SUFFIX} - Real-time messaging for people and teams`;
  }, [title, separator]);
}
