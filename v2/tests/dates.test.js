import test from 'node:test'
import assert from 'node:assert/strict'
import { localDateKey, dateContext } from '../src/lib/dates.js'
import { pagination } from '../server/pagination.js'
import { answerQuestion } from '../src/lib/assistant.js'
import { t } from '../src/lib/i18n.js'

process.env.TZ = 'Europe/Madrid'
test('hoy se calcula en la zona local, no en UTC', () => {
  assert.equal(localDateKey(new Date('2026-10-20T00:30:00+02:00')), '2026-10-20')
  const context = dateContext(new Date('2026-12-31T23:59:00+01:00'))
  assert.equal(context.todayKey, '2026-12-31')
  assert.equal(context.tomorrowKey, '2027-01-01')
})
test('los días del calendario se mantienen correctos al cambiar la hora', () => {
  const context = dateContext(new Date('2026-10-24T23:30:00+02:00'))
  assert.equal(context.calendarDays.length, 7)
  assert.equal(localDateKey(context.calendarDays[1]), '2026-10-25')
  assert.equal(localDateKey(context.calendarDays[2]), '2026-10-26')
  assert.equal(dateContext(new Date('2026-10-25T00:01:00+02:00')).todayKey, '2026-10-25')
})
test('paginación acotada y tolerante a parámetros inválidos', () => {
  assert.deepEqual(pagination(), { page: 1, pageSize: 20, offset: 0 })
  assert.deepEqual(pagination({ page: '-1', pageSize: 'Infinity' }), pagination())
  assert.deepEqual(pagination({ page: '2', pageSize: '10000' }), { page: 2, pageSize: 100, offset: 100 })
  assert.equal(pagination({ page: '2.1' }).page, 1)
})
test('traducciones conservan los valores de la API y los nombres propios', () => {
  assert.equal(t('In progress'), 'En curso')
  assert.equal(t('Proyecto personalizado'), 'Proyecto personalizado')
})
test('el asistente entiende español, excluye proyectos completados y no modifica datos', () => {
  const workspace = {
    tasks: [{ title: 'Antigua', due_date: '2026-10-01', status: 'To do' }],
    projects: [{ name: 'Activo', progress: 20, status: 'On track', due_date: '2026-11-01' }, { name: 'Finalizado', progress: 0, status: 'Complete', due_date: '2026-01-01' }],
    issues: [{ title: 'Acceso', severity: 'Critical', owner: 'Ana', status: 'Open' }],
  }
  const before = JSON.stringify(workspace)
  assert.match(answerQuestion('¿Qué proyectos están en riesgo?', workspace, '2026-10-20'), /Activo/)
  assert.doesNotMatch(answerQuestion('proyectos', workspace, '2026-10-20'), /Finalizado/)
  assert.match(answerQuestion('incidencias', workspace, '2026-10-20'), /Acceso/)
  assert.match(answerQuestion('atención hoy', workspace, '2026-10-20'), /Antigua/)
  assert.match(answerQuestion('escribe una canción', workspace, '2026-10-20'), /No utilizo IA generativa/)
  assert.equal(JSON.stringify(workspace), before)
})
