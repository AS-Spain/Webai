import { useEffect, useRef, useState } from 'react'

export function useAssistantVoice(onTranscript, enabled = true) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState('es-ES')
  const recognition = useRef(null), utterance = useRef(null), callback = useRef(onTranscript), enabledRef = useRef(enabled)
  useEffect(() => { callback.current = onTranscript }, [onTranscript])
  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) { recognition.current?.abort(); if (utterance.current) window.speechSynthesis.cancel() }
  }, [enabled])
  const canListen = typeof window !== 'undefined' && window.isSecureContext && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  useEffect(() => {
    const stop = () => { recognition.current?.abort(); if (utterance.current) window.speechSynthesis.cancel() }
    const visibility = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', stop)
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', stop) }
  }, [])
  useEffect(() => () => {
    if (recognition.current) { recognition.current.onresult = null; recognition.current.onend = null; recognition.current.onerror = null; recognition.current.abort() }
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; window.speechSynthesis.cancel() }
  }, [])
  function stopListening() { recognition.current?.stop() }
  function startListening(prefix) {
    if (!canListen) { setError('El dictado requiere HTTPS y un navegador compatible, como Chrome o Edge. Puedes seguir escribiendo.'); return }
    stopSpeaking(); setError('')
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const instance = new Recognition()
    instance.lang = language; instance.continuous = true; instance.interimResults = true
    instance.onresult = (event) => {
      if (!enabledRef.current || document.hidden) return
      const text = Array.from(event.results).map((result) => result[0].transcript).join(' ')
      callback.current(`${prefix}${prefix ? ' ' : ''}${text}`.slice(0, 2000))
    }
    instance.onend = () => { setListening(false); recognition.current = null }
    instance.onerror = (event) => {
      const message = { 'not-allowed': 'No se ha autorizado el micrófono. Revisa los permisos del navegador y de la vista incrustada.', 'audio-capture': 'No se encuentra un micrófono disponible.', 'network': 'El servicio de dictado del navegador no está disponible.', 'no-speech': 'No se detectó voz. Puedes volver a intentarlo.', 'language-not-supported': 'El navegador no admite el idioma seleccionado.' }[event.error]
      if (event.error !== 'aborted') setError(message || 'No se pudo completar el dictado. Puedes seguir escribiendo.')
      setListening(false)
    }
    recognition.current = instance
    try { instance.start(); setListening(true) } catch { recognition.current = null; setListening(false); setError('No se pudo iniciar el micrófono.') }
  }
  function stopSpeaking() { if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; utterance.current = null }; if (canSpeak) window.speechSynthesis.cancel(); setSpeaking(false) }
  function speak(text) {
    if (!enabledRef.current || document.hidden) return
    if (!canSpeak) { setError('La lectura en voz alta no está disponible en este navegador.'); return }
    stopSpeaking(); setError('')
    const item = new window.SpeechSynthesisUtterance(text.slice(0, 16000))
    item.lang = language
    item.onend = () => { if (utterance.current === item) { setSpeaking(false); utterance.current = null } }
    item.onerror = (event) => { setSpeaking(false); if (!['canceled', 'interrupted'].includes(event.error)) setError('El navegador no pudo reproducir la voz. Usa el botón Leer para volver a intentarlo.') }
    utterance.current = item
    try { window.speechSynthesis.speak(item); setSpeaking(true) } catch { setSpeaking(false); setError('No se pudo iniciar la lectura en voz alta.') }
  }
  return { canListen, canSpeak, listening, speaking, error, language, setLanguage, startListening, stopListening, speak, stopSpeaking }
}
