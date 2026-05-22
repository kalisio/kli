import boxen from 'boxen'
import chalk from 'chalk'

const BOX_DEFAULTS = { titleAlignment: 'center', width: 80, padding: { top: 1, bottom: 1 } }

export const logger = {
  _indent: 0,
  _context: [],
  _pad () { return ' '.repeat(this._indent) },
  _prefix () { return this._context.length ? chalk.dim(`[${this._context.at(-1)}] `) : '' },
  push (context, label) {
    this._context.push(context)
    this._indent += 2
    if (label) console.log(this._pad() + this._prefix() + label)
  },
  pull (label) {
    if (label) console.log(this._pad() + this._prefix() + label)
    this._indent = Math.max(0, this._indent - 2)
    this._context.pop()
  },
  info (msg) {
    console.log(this._pad() + this._prefix() + `▸ ${msg}`)
  },
  positive (msg) {
    console.log(this._pad() + this._prefix() + chalk.greenBright(`✔ ${msg}`))
  },
  negative (msg) {
    console.log(this._pad() + this._prefix() + chalk.redBright(`✘ ${msg}`))
  },
  warning (msg) {
    console.log(this._pad() + this._prefix() + chalk.yellowBright(`▲ ${msg}`))
  },
  infoBox (msg, title) {
    console.log(chalk.blueBright(boxen(msg, { ...BOX_DEFAULTS, title, borderColor: 'blueBright' })))
  },
  positiveBox (msg, title) {
    console.log(chalk.greenBright(boxen(msg, { ...BOX_DEFAULTS, title, borderColor: 'greenBright' })))
  },
  negativeBox (msg, title) {
    console.log(chalk.redBright(boxen(msg, { ...BOX_DEFAULTS, title, borderColor: 'redBright' })))
  },
  warningBox (msg, title) {
    console.log(chalk.yellowBright(boxen(msg, { ...BOX_DEFAULTS, title, borderColor: 'yellowBright' })))
  }
}
