export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dateContext(date = new Date()) {
  const tomorrow = new Date(date)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return {
    referenceDate: date,
    todayKey: localDateKey(date),
    currentTime: date.getTime(),
    tomorrowKey: localDateKey(tomorrow),
    calendarDays: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(date)
      day.setDate(day.getDate() + index)
      return day
    }),
  }
}
