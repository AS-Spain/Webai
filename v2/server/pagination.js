export function pagination(query = {}) {
  const integer = (value, fallback, max) => {
    const number = Number(value)
    return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback
  }
  const page = integer(query.page, 1, 1_000_000)
  const pageSize = integer(query.pageSize, 20, 100)
  return { page, pageSize, offset: (page - 1) * pageSize }
}
