import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { logger } from './logger.js'
import chalk from 'chalk'

export class Git {
  constructor (commander) {
    this.commander = commander
  }

  buildRepoUrl (url, organization, module) {
    const separator = url.indexOf('://') !== -1 ? '/' : ':'
    return `${url}${separator}${organization}/${module}.git`
  }

  // Current branch, or tag/commit when HEAD is detached (e.g. clone of a tag)
  getBranch (dir) {
    const git = args => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    try {
      return git(['branch', '--show-current']) || git(['describe', '--tags', '--always'])
    } catch {
      return 'unknown'
    }
  }

  async clone (repoUrl, output, opts = {}, module) {
    const { branch, shallowClone } = opts
    const cloned = fs.existsSync(output)
    const target = cloned ? `branch ${chalk.bold(this.getBranch(output))}` : branch ? `branch ${chalk.bold(branch)}` : 'default branch'
    logger.push(module, `Cloning ${target}...`)
    try {
      if (cloned) {
        logger.warning('clone skipped: module already cloned')
      } else {
        const flags = ['--quiet', '--recurse-submodules']
        if (branch) flags.push(`--branch ${branch}`)
        if (shallowClone) {
          flags.push('--depth 1')
          flags.push('--shallow-submodules')
        }
        await this.commander.run(`git -c advice.detachedHead=false clone ${flags.join(' ')} ${repoUrl} ${output}`, { module, message: 'cloned' })
      }
    } finally {
      logger.pull()
    }
  }

  async pull (repoUrl, module) {
    logger.push(module, `Pulling branch ${chalk.bold(this.getBranch(this.commander.cwd))}...`)
    try {
      await this.commander.run(`git remote set-url origin ${repoUrl}`, { module })
      await this.commander.run('git pull --quiet --recurse-submodules --rebase', { module, message: 'pulled' })
    } finally {
      logger.pull()
    }
  }
}
