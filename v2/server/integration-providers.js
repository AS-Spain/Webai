const graphScopes = 'offline_access Calendars.ReadWrite Mail.Send'
export const integrationProviders = {
  google: { name: 'Google Calendar', kind: 'calendar', scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', pkce: true },
  outlook: { name: 'Microsoft Outlook', kind: 'calendar-mail', scopes: graphScopes, microsoft: true, pkce: true },
  slack: { name: 'Slack', kind: 'messages', scopes: 'chat:write,channels:read', authorize: 'https://slack.com/oauth/v2/authorize', token: 'https://slack.com/api/oauth.v2.access' },
  teams: { name: 'Microsoft Teams', kind: 'messages-meetings', scopes: 'offline_access Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Send OnlineMeetings.ReadWrite', microsoft: true, pkce: true },
}
export function providerEndpoints(id, tenant = 'organizations') {
  const provider = Object.hasOwn(integrationProviders, id) && integrationProviders[id]
  if (!provider) return null
  if (!provider.microsoft) return provider
  if (!['organizations', 'common'].includes(tenant) && !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(tenant)) throw new Error('Tenant Microsoft no válido: utiliza su UUID, organizations o common.')
  return { ...provider, authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token` }
}
