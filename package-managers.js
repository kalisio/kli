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
      await this.commander.run(`yarn install ${opts.join(' ')}`.trimEnd(), { module, message: 'installed' })
    } finally {
      logger.pull()
    }
  }

  async link (module) {
    const opts = this.programOptions.linkFolder ? `--link-folder ${this.programOptions.linkFolder}` : ''
    logger.push(module, 'Linking...')
    try {
      await this.commander.run(`yarn link ${opts}`.trimEnd(), { module, message: 'linked' })
    } finally {
      logger.pull()
    }
  }

  async unlink (module) {
    const opts = this.programOptions.linkFolder ? `--link-folder ${this.programOptions.linkFolder}` : ''
    logger.push(module, 'Unlinking...')
    try {
      await this.commander.run(`yarn unlink ${opts}`.trimEnd(), { module, message: 'unlinked' })
    } finally {
      logger.pull()
    }
  }

  async linkDependency (dependency) {
    const opts = this.programOptions.linkFolder ? `--link-folder ${this.programOptions.linkFolder}` : ''
    logger.push(dependency, 'Linking...')
    try {
      await this.commander.run(`yarn link ${dependency} ${opts}`.trimEnd(), { module: dependency, message: 'linked' })
    } finally {
      logger.pull()
    }
  }

  async unlinkDependency (dependency) {
    const opts = this.programOptions.linkFolder ? `--link-folder ${this.programOptions.linkFolder}` : ''
    logger.push(dependency, 'Unlinking...')
    try {
      await this.commander.run(`yarn unlink ${dependency} ${opts}`.trimEnd(), { module: dependency, message: 'unlinked' })
    } finally {
      logger.pull()
    }
  }
}

// ── Pnpm implementation ───────────────────────────────────────────────────

class Pnpm {
  constructor (programOptions = {}, commander) {
    this.programOptions = programOptions
    this.commander = commander
  }

  getName () {
    return 'pnpm'
  }

  async install (module) {
    logger.push(module, 'Installing...')
    try {
      await this.commander.run('pnpm install', { module, message: 'installed' })
    } finally {
      logger.pull()
    }
  }

  getLinkDir () {
    return this.programOptions.linkFolder ?? '$(yarn global dir)'
  }

  async link (module) {
    logger.push(module, 'Linking...')
    try {
      const linkDir = this.getLinkDir()
      await this.commander.run(`ln -s "${this.commander.cwd}" "${linkDir}/${module}"`, { module, message: 'linked' })
    } finally {
      logger.pull()
    }
  }

  async unlink (module) {
    logger.push(module, 'Unlinking...')
    try {
      const linkDir = this.getLinkDir()
      await this.commander.run(`rm -f "${linkDir}/${module}"`, { module, message: 'unlinked' })
    } finally {
      logger.pull()
    }
  }

  async linkDependency (dependency, dependencyDir) {
    logger.push(dependency, 'Linking...')
    try {
      await this.commander.run(`rm -f node_modules/${dependency} && ln -s ${dependencyDir} node_modules/${dependency}`, { module: dependency, message: 'linked' })
    } finally {
      logger.pull()
    }
  }

  async unlinkDependency (dependency) {
    logger.push(dependency, 'Unlinking...')
    try {
      await this.commander.run(`rm -fr node_modules/${dependency} && pnpm install`, { module: dependency, message: 'unlinked' })
    } finally {
      logger.pull()
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createPackageManager (packageManagerField, programOptions = {}, commander) {
  if (packageManagerField && packageManagerField.includes('pnpm')) {
    return new Pnpm(programOptions, commander)
  }
  return new Yarn(programOptions, commander)
}
