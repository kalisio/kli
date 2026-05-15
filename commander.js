import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { logger } from './logger.js'
import { reporter } from './reporter.js'

const exec = promisify(execCb)
const wait = promisify(setTimeout)

export class Commander {
  constructor (options = {}) {
    this.options = options
  }

  async run (command, context) {
    try {
      const { stdout, stderr } = await exec(command)
      if (this.options.commandOutput) logger.log(stdout.trim())
      if (stderr !== '') logger.warning(stderr.trim())
    } catch (error) {
      if (this.options.failOnError) {
        logger.negative(error)
        logger.warning('Command failed and no-fail-on-error is not set, exiting ...')
        process.exit(1)
      } else {
        reporter.addError(context, error)
        throw error
      }
    }
    await wait(1000)
  }
}
