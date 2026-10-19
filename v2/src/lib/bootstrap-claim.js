import { api } from './api.js'
// Do not abort the claim when React StrictMode remounts an effect: the first
// response establishes the browser's HttpOnly installation cookie.
let pendingClaim = null
export function claimBootstrapToken() {
  if (!pendingClaim) pendingClaim = api('/setup/claim', { method: 'POST', body: '{}' }).finally(() => { pendingClaim = null })
  return pendingClaim
}
