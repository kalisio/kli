import { logger } from './logger.js'

export class Git {
  constructor (commander) {
    this.commander = commander
  }

  buildRepoUrl (url, organization, module) {
    const separator = url.indexOf('://') !== -1 ? '/' : ':'
    const repoUrl = `${url}${separator}${organization}/${module}.git`
    return repoUrl
  }

  async clone (repoUrl, output, opts = {}, module, alreadyExists) {
    logger.push(module, 'Cloning...')
    if (alreadyExists) {
      logger.warning('clone skipped: module already cloned')
    } else {
      const { branch, shallowClone } = opts
      const flags = ['--recurse-submodules']
      if (branch) flags.push(`--branch ${branch}`)
      if (shallowClone) {
        flags.push('--depth 1')
        flags.push('--shallow-submodules')
      }
      try {
        await this.commander.run(`git clone ${flags.join(' ')} ${repoUrl} ${output}`, module)
        logger.positive('cloned')
      } catch (error) {
        logger.negative(`clone failed: ${error}`)
      }
    }
    logger.pull()
  }

  async pull (repoUrl, module) {
    logger.push(module, 'Pulling...')
    try {
      await this.commander.run(`git remote set-url origin ${repoUrl}`, module)
      await this.commander.run('git pull --recurse-submodules --rebase', module)
      logger.positive('pulled')
    } catch (error) {
      logger.negative(`pull failed: ${error}`)
    }
    logger.pull()
  }

  async switch (branch, module) {
    logger.push(module, `Switching to branch ${branch}...`)
    try {
      await this.commander.run(`git fetch origin ${branch}`, module)
      await this.commander.run(`git checkout ${branch}`, module)
      logger.positive('switched')
    } catch (error) {
      logger.negative(`switch failed: ${error}`)
    }
    logger.pull()
  }
}
