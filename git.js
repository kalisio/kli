import fs from 'node:fs'
import { logger } from './logger.js'

export class Git {
  constructor (commander) {
    this.commander = commander
  }

  buildRepoUrl (url, organization, module) {
    const separator = url.indexOf('://') !== -1 ? '/' : ':'
    return `${url}${separator}${organization}/${module}.git`
  }

  async clone (repoUrl, output, opts = {}, module) {
    logger.push(module, 'Cloning...')
    try {
      if (fs.existsSync(output)) {
        logger.warning('clone skipped: module already cloned')
      } else {
        const { branch, shallowClone } = opts
        const flags = ['--recurse-submodules']
        if (branch) flags.push(`--branch ${branch}`)
        if (shallowClone) {
          flags.push('--depth 1')
          flags.push('--shallow-submodules')
        }
        await this.commander.run(`git clone ${flags.join(' ')} ${repoUrl} ${output}`, { module, message: 'cloned' })
      }
    } finally {
      logger.pull()
    }
  }

  async pull (repoUrl, module) {
    logger.push(module, 'Pulling...')
    try {
      await this.commander.run(`git remote set-url origin ${repoUrl}`, { module })
      await this.commander.run('git pull --recurse-submodules --rebase', { module, message: 'pulled' })
    } finally {
      logger.pull()
    }
  }
}
