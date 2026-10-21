export const resourceRoles = {
  projects: { create: ['admin', 'manager'], update: ['admin', 'manager'], delete: ['admin', 'manager'] },
  tasks: { create: ['admin', 'manager', 'member'], update: ['admin', 'manager', 'member'], delete: ['admin', 'manager'] },
  meetings: { create: ['admin', 'manager', 'member'], update: ['admin', 'manager', 'member'], delete: ['admin', 'manager'] },
  events: { create: ['admin', 'manager'], update: ['admin', 'manager'], delete: ['admin', 'manager'] },
  issues: { create: ['admin', 'manager', 'member'], update: ['admin', 'manager', 'member'], delete: ['admin', 'manager'] },
}


export const resourceConfig = {
  projects: {
    columns: ['name', 'owner', 'status', 'progress', 'due_date', 'budget', 'color'],
    required: ['name', 'owner', 'due_date'],
    enums: { status: ['On track', 'At risk', 'Behind', 'Complete'] },
    numberFields: ['progress', 'budget'],
  },
  tasks: {
    columns: ['project_id', 'title', 'assignee', 'priority', 'status', 'due_date'],
    required: ['title', 'assignee', 'due_date'],
    enums: { priority: ['Low', 'Medium', 'High'], status: ['To do', 'In progress', 'Done'] },
  },
  meetings: {
    columns: ['title', 'starts_at', 'duration', 'attendees', 'location', 'agenda'],
    required: ['title', 'starts_at'],
    numberFields: ['duration'],
    jsonFields: ['attendees'],
  },
  issues: {
    columns: ['title', 'description', 'category', 'severity', 'status', 'owner', 'impact', 'recommendation'],
    required: ['title', 'owner'],
    enums: { severity: ['Low', 'Medium', 'High', 'Critical'], status: ['Open', 'Investigating', 'Resolved'] },
    numberFields: ['impact'],
  },
  events: {
    columns: ['title', 'starts_at', 'location', 'attendees', 'status'],
    required: ['title', 'starts_at'],
    enums: { status: ['Planning', 'Confirmed', 'Complete'] },
    numberFields: ['attendees'],
  },
}

export const parseRow = (resource, row) => {
  if (!row) return row
  if (resource === 'meetings') {
    try { return { ...row, attendees: JSON.parse(row.attendees) } } catch { return { ...row, attendees: [] } }
  }
  return row
}
