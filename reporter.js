import { logger } from './logger.js'

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

export const reporter = {
  _errors: {},

  addError (context, error) {
    if (this._errors[context]) this._errors[context].push(error)
    else this._errors[context] = [error]
  },

  hasErrors () {
    return Object.keys(this._errors).length > 0
  },

  report () {
    const nbErrors = Object.keys(this._errors).length
    if (nbErrors === 0) return
    logger.negativeBox('Encountered errors during execution, you might review it below', plural(nbErrors, 'error'))
    for (const [context, errors] of Object.entries(this._errors)) {
      logger.negativeBox(errors.map(e => e.stderr || e.message || e).join('\n'), `${context} : ${plural(errors.length, 'error')}`)
    }
  }
}
