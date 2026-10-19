import { t } from './i18n.js'
import { CalendarDays, FileBarChart2, Flag, FolderKanban, LayoutDashboard, ListTodo, ShieldAlert, Sparkles, Users, Workflow } from 'lucide-react'

export const navGroups = [
  {
    label: t("WORKSPACE"),
    items: [
      { id: 'dashboard', label: t("Overview"), icon: LayoutDashboard },
      { id: 'calendar', label: t("Calendar"), icon: CalendarDays },
      { id: 'meetings', label: t("Meetings"), icon: Users },
      { id: 'events', label: t("Events"), icon: Flag },
    ],
  },
  {
    label: t("DELIVERY"),
    items: [
      { id: 'tasks', label: t("Tasks"), icon: ListTodo },
      { id: 'projects', label: t("Projects"), icon: FolderKanban },
      { id: 'issues', label: t("Issues"), icon: ShieldAlert, badge: 'critical' },
    ],
  },
  {
    label: t("INTELLIGENCE"),
    items: [
      { id: 'automations', label: t("Automations"), icon: Workflow },
      { id: 'assistant', label: t("AI assistant"), icon: Sparkles },
      { id: 'reports', label: t("Reports"), icon: FileBarChart2 },
    ],
  },
]

export const rolePermissions = {
  admin: new Set([
    'projects:create', 'projects:update', 'projects:delete',
    'tasks:create', 'tasks:update', 'tasks:delete',
    'meetings:create', 'meetings:update', 'meetings:delete',
    'events:create', 'events:update', 'events:delete',
    'issues:create', 'issues:update',
    'automations:manage', 'users:manage',
  ]),
  manager: new Set([
    'projects:create', 'projects:update', 'projects:delete',
    'tasks:create', 'tasks:update', 'tasks:delete',
    'meetings:create', 'meetings:update', 'meetings:delete',
    'events:create', 'events:update', 'events:delete',
    'issues:create', 'issues:update',
  ]),
  member: new Set([
    'tasks:create', 'tasks:update',
    'meetings:create', 'meetings:update',
    'issues:create', 'issues:update',
  ]),
  viewer: new Set(),
}

export function can(role, permission) {
  return rolePermissions[role]?.has(permission) || false
}

export const pageMeta = {
  dashboard: [t("Good morning"), t("Here is what needs your attention today.")],
  calendar: [t("Calendar"), t("A clear view of the work ahead.")],
  meetings: [t("Meetings"), t("Conversations, decisions, and next steps.")],
  events: [t("Events"), t("Plan the moments that bring your teams together.")],
  tasks: [t("Tasks"), t("Keep the important work moving.")],
  projects: [t("Projects"), t("A live view of your team’s priorities.")],
  issues: [t("Issues & incidents"), t("Surface blockers early and keep a clear owner.")],
  automations: [t("Automations"), t("Small rules that keep work flowing.")],
  assistant: [t("AI assistant"), t("Ask a question about the work in your workspace.")],
  reports: [t("Reports"), t("A measured view of progress and operational health.")],
  team: [t("Your team"), t("People, responsibilities, and access.")],
  settings: [t("Workspace settings"), t("Manage your workspace and connected services.")],
}
