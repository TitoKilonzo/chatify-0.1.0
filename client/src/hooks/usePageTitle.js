import { useEffect } from 'react';

const SUFFIX = 'Chatify';

/** Set the document title for a public page, e.g. "About - Chatify". */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title
      ? `${title} - ${SUFFIX}`
      : `${SUFFIX} - Real-time messaging for people and teams`;
  }, [title]);
}
