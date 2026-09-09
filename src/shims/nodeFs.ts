const unavailable = () => {
  throw new Error('Filesystem path APIs are unavailable in the browser.')
}

export const promises = {
  readFile: unavailable,
  open: unavailable,
}

export const readFileSync = unavailable
