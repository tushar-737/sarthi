/** Keeps the browser tab in step with the screen the citizen is on. */

import { useEffect } from 'react'

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
