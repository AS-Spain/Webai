import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

export function useSearch(query, enabled) {
  const [state, setState] = useState({ query: '', results: [], searchError: '' })
  useEffect(() => {
    if (!enabled || !query.trim()) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const results = await api(`/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        if (!controller.signal.aborted) setState({ query, results, searchError: '' })
      } catch (error) {
        if (!controller.signal.aborted) setState({ query, results: [], searchError: error.message })
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, enabled])
  const current = enabled && state.query === query
  return { results: current ? state.results : [], searchError: current ? state.searchError : '', searching: enabled && Boolean(query.trim()) && !current }
}
