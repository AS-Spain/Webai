import { useCallback, useEffect, useRef, useState } from 'react'
import { api, allRecords } from '../lib/api.js'

export const initialState = {
  projects: [], tasks: [], meetings: [], issues: [], events: [],
  automations: [], team: [], invitations: [], overview: null,
}
const listResources = new Set(['tasks', 'projects', 'meetings', 'events', 'issues'])
const dependencies = {
  dashboard: ['overview'], tasks: ['projects'], projects: ['tasks'],
  meetings: [], events: [], issues: [], automations: ['automations'],
  calendar: ['meetings', 'events', 'tasks'],
  assistant: ['projects', 'tasks', 'issues', 'meetings'],
  reports: ['projects', 'tasks', 'issues'], team: ['team', 'tasks'], settings: [],
}

export function useWorkspace(view, role, modal, onError) {
  const [workspace, setWorkspace] = useState(initialState)
  const [loading, setLoading] = useState(false)
  const [pages, setPages] = useState({})
  const [filters, setFilters] = useState({})
  const filter = filters[view] || (view === 'tasks' ? 'All tasks' : 'All')
  const [pageInfo, setPageInfo] = useState(null)
  const active = useRef(null)
  const currentPage = pages[view] || 1

  const loadWorkspace = useCallback(async () => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    if (!role) {
      setWorkspace(initialState)
      setPageInfo(null)
      setPages((previous) => Object.keys(previous).length ? {} : previous)
      setFilters((previous) => Object.keys(previous).length ? {} : previous)
      setLoading(false)
      return
    }
    setLoading(true)
    const resources = new Set(dependencies[view] || [])
    if (listResources.has(view)) resources.add(view)
    if (view === 'team' && role === 'admin') resources.add('invitations')
    if (modal && modal !== 'invitations') {
      resources.add('team')
      if (modal === 'tasks') resources.add('projects')
    }
    try {
      let pagination = null
      const entries = await Promise.all([...resources].map(async (resource) => {
        if (resource === view && listResources.has(view)) {
          const result = await api(`/${resource}?page=${currentPage}&pageSize=20${['All', 'All tasks'].includes(filter) ? '' : `&status=${encodeURIComponent(filter)}`}`, { signal: controller.signal })
          pagination = result
          return [resource, result.items]
        }
        const value = listResources.has(resource)
          ? await allRecords(resource, controller.signal)
          : await api(`/${resource}`, { signal: controller.signal })
        return [resource, value]
      }))
      if (controller.signal.aborted) return
      // Deletions may leave the last page empty: go back to the last valid page.
      if (pagination && currentPage > Math.max(1, pagination.totalPages)) {
        setPages((previous) => ({ ...previous, [view]: Math.max(1, pagination.totalPages) }))
        return
      }
      setWorkspace({ ...initialState, ...Object.fromEntries(entries) })
      setPageInfo(pagination ? { ...pagination, items: undefined } : null)
      onError('')
    } catch (error) {
      if (!controller.signal.aborted) onError(error.message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [view, role, modal, currentPage, filter, onError])

  // A mutation can finish after navigation. Refresh the latest view, not the
  // view captured by the event handler when the mutation started.
  const latestLoad = useRef(loadWorkspace)
  const refresh = useCallback(() => latestLoad.current(), [])

  useEffect(() => {
    latestLoad.current = loadWorkspace
    // Synchronize this view with the external REST API.
    // eslint-disable-next-line react/set-state-in-effect
    loadWorkspace()
    return () => active.current?.abort()
  }, [loadWorkspace])

  return {
    workspace, loading, loadWorkspace: refresh, pageInfo, filter,
    changeFilter: (value) => {
      setFilters((previous) => ({ ...previous, [view]: value }))
      setPages((previous) => ({ ...previous, [view]: 1 }))
    },
    changePage: (page) => setPages((previous) => ({ ...previous, [view]: page })),
  }
}
