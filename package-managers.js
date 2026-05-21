import { logger } from './logger.js'

// ── Yarn implementation ───────────────────────────────────────────────────

class Yarn {
  constructor (programOptions = {}, commander) {
    this.programOptions = programOptions
    this.commander = commander
  }

  getName () {
    return 'yarn'
  }

  async install (module, moduleOptions = {}) {
    const opts = []
    if (this.programOptions.checkFiles) opts.push('--check-files')
    if (moduleOptions.ignoreOptional === undefined || moduleOptions.ignoreOptional === true) {
      opts.push('--ignore-optional')
    }
    logger.push(module, 'Installing...')
    try {
      await this.commander.run(`yarn install ${opts.join(' ')}`.trimEnd(), module)
      logger.positive('installed')
    } catch (error) {
      logger.negative(`installation failed: ${error}`)
    }
    logger.pull()
  }

  async link (module) {
    const opts = this.programOptions.linkFolder ? `--link-folder ${this.programOptions.linkFolder}` : ''
    logger.push(module, 'Linking...')
    try {
      await this.commander.run(`yarn link ${opts}`.trimEnd(), module)
      logger.positive('linked')
    } catch (error) {
      logger.negative(`link failed: ${error}`)
    }
    logger.pull()
  }

  async unlink (module) {
    const opts = this.programOptions.linkFolder ? `--link-folder ${this.programOptions.linkFolder}` : ''
    logger.push(module, 'Unlinking...')
    try {
      await this.commander.run(`yarn unlink ${opts}`.trimEnd(), module)
      logger.positive('unlinked')
    } catch (error) {
      logger.negative(`unlink failed: ${error}`)
    }
    logger.pull()
  }

  async linkDependency (dependency) {
    const opts = this.programOptions.linkFolder ? `--link-folder ${this.programOptions.linkFolder}` : ''
    logger.push(dependency, 'Linking...')
    try {
      await this.commander.run(`yarn link ${dependency} ${opts}`.trimEnd(), dependency)
      logger.positive('linked')
    } catch (error) {
      logger.negative(`link failed: ${error}`)
    }
    logger.pull()
  }

  async unlinkDependency (dependency) {
    const opts = this.programOptions.linkFolder ? `--link-folder ${this.programOptions.linkFolder}` : ''
    logger.push(dependency, 'Unlinking...')
    try {
      await this.commander.run(`yarn unlink ${dependency} ${opts}`.trimEnd(), dependency)
      logger.positive('unlinked')
    } catch (error) {
      logger.negative(`unlink failed: ${error}`)
    }
    logger.pull()
  }
}

// ── Pnpm implementation ───────────────────────────────────────────────────

class Pnpm {
  constructor (options = {}, commander) {
    this.programOptions = options
    this.commander = commander
  }

  getName () {
    return 'pnpm'
  }

  async install (module) {
    logger.push(module, 'Installing...')
    try {
      await this.commander.run('pnpm install', module)
      logger.positive('installed')
    } catch (error) {
      logger.negative(`installation failed: ${error}`)
    }
    logger.pull()
  }

  /**
   * pnpm doesn't have a native `link` command equivalent to yarn link,
   * so we simulate it with a symlink into the global dir.
   */
  async link (module) {
    logger.push(module, 'Linking...')
    try {
      await this.commander.run(`ln -s "$(pwd)" "$(yarn global dir)/${module}"`, module)
      logger.positive('linked')
    } catch (error) {
      logger.negative(`link failed: ${error}`)
    }
    logger.pull()
  }

  async unlink (module) {
    logger.push(module, 'Unlinking...')
    try {
      await this.commander.run(`rm -f "$(yarn global dir)/${module}"`, module)
      logger.positive('unlinked')
    } catch (error) {
      logger.negative(`unlink failed: ${error}`)
    }
    logger.pull()
  }

  async linkDependency (dependency, dependencyDir) {
    logger.push(dependency, 'Linking...')
    try {
      await this.commander.run(`rm -f node_modules/${dependency} && ln -s ${dependencyDir} node_modules/${dependency}`, dependency)
      logger.positive('linked')
    } catch (error) {
      logger.negative(`link failed: ${error}`)
    }
    logger.pull()
  }

  async unlinkDependency (dependency) {
    logger.push(dependency, 'Unlinking...')
    try {
      await this.commander.run(`rm -fr node_modules/${dependency} && pnpm install`, dependency)
      logger.positive('unlinked')
    } catch (error) {
      logger.negative(`unlink failed: ${error}`)
    }
    logger.pull()
  }
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createPackageManager (packageManagerField, options = {}, commander) {
  if (packageManagerField && packageManagerField.includes('pnpm')) {
    return new Pnpm(options, commander)
  }
  return new Yarn(options, commander)
}
