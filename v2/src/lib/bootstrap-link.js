// The private link carries the secret only in the URL fragment: fragments are
// never sent in HTTP requests or Referer headers. Do not use browser storage.
export function readBootstrapFragment(location) {
  const token = new URLSearchParams(location.hash.slice(1)).get('setup') || ''
  return token.length >= 32 && token.length <= 512 && Array.from(token).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127) ? token : ''
}
export function scrubBootstrapFragment(location, history) {
  const fragment = new URLSearchParams(location.hash.slice(1))
  if (!fragment.has('setup')) return
  fragment.delete('setup')
  const remaining = fragment.toString()
  history.replaceState(history.state, '', `${location.pathname}${location.search}${remaining ? `#${remaining}` : ''}`)
}
