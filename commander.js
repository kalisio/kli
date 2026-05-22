import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { logger } from './logger.js'
import { reporter } from './reporter.js'

const exec = promisify(execCb)
const wait = promisify(setTimeout)

export class Commander {
  constructor (programOptions = {}, cwd = process.cwd()) {
    this.programOptions = programOptions
    this.cwd = cwd
  }

  async run (command, context = {}) {
    const { module, message } = context
    try {
      const { stdout, stderr } = await exec(command, { cwd: this.cwd })
      if (this.programOptions.commandOutput) logger.log(stdout.trim())
      if (stderr !== '') logger.warning(stderr.trim())
      if (message) logger.positive(message)
    } catch (error) {
      if (this.programOptions.failOnError) {
        logger.negative(error)
        logger.warning('Command failed and no-fail-on-error is not set, exiting ...')
        process.exit(1)
      } else {
        if (message) logger.negative(`${message} failed: ${error}`)
        if (module) reporter.addError(module, error)
        throw error
      }
    }
    await wait(1000)
  }
}
