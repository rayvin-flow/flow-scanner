export const parseBool = (value?: string, defaultValue: boolean = false) => {
  return value === undefined
    ? defaultValue
    : (value.trim().toLowerCase() === 'true' || parseInt(value) === 1)
}

export const parseStringArray = (value?: string): string[] => {
  if (!value) {
    return []
  }

  return value.split(',').map(s => String(s).trim()).filter(s => s.length > 0)
}
