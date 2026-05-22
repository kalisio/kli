import path from 'node:path'
import fs from 'node:fs'
import makeDebug from 'debug'
import { Commander } from './commander.js'
import { Git } from './git.js'
import { createPackageManager } from './package-managers.js'
import { logger } from './logger.js'

const debug = makeDebug('kli')

export class Module {
  constructor (name, options, programOptions) {
    this.name = name
    this.options = options
    this.programOptions = programOptions
    this.rootDir = this.resolveRootDir()
    this.dir = this.resolveDir()
    debug(`[${name}] rootDir: ${this.rootDir}`)
    debug(`[${name}] dir: ${this.dir}`)
    this.commander = new Commander(programOptions, this.dir)
    this.git = new Git(this.commander)
    this.pm = this.resolvePackageManager(this.dir)
    debug(`[${name}] package manager: ${this.pm.getName()}`)
    this.packages = this.scanPackages()
    if (this.packages) {
      debug(`[${name}] packages: ${this.packages.map(p => p.qualifiedName).join(', ')}`)
    }
  }

  resolveRootDir () {
    const { path: optPath } = this.options
    if (!optPath) return process.cwd()
    return path.isAbsolute(optPath) ? optPath : path.join(process.cwd(), optPath)
  }

  resolveDir () {
    const output = this.options.output || this.name
    const { path: optPath } = this.options
    if (!optPath) return path.join(process.cwd(), output)
    return path.isAbsolute(optPath)
      ? path.join(optPath, output)
      : path.join(process.cwd(), optPath, output)
  }

  resolvePackageManager (dir) {
    const pkgJsonPath = path.join(dir, 'package.json')
    let pkgManagerField
    if (fs.existsSync(pkgJsonPath)) {
      pkgManagerField = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).packageManager
    }
    return createPackageManager(pkgManagerField, this.programOptions, new Commander(this.programOptions, dir))
  }

  scanPackages () {
    const packagesDir = path.join(this.dir, 'packages')
    if (!fs.existsSync(packagesDir) || !fs.statSync(packagesDir).isDirectory()) return null

    const organization = this.options.organization || this.programOptions.organization || 'kalisio'
    return fs.readdirSync(packagesDir, { withFileTypes: true })
      .filter(f => f.isDirectory())
      .map(f => {
        const packageName = this.options.prefix ? `${this.options.prefix}-${f.name}` : f.name
        return {
          name: f.name,
          qualifiedName: `@${organization}/${packageName}`,
          dir: path.join(this.dir, 'packages', f.name)
        }
      })
  }

  // Expose package dirs for Workspace.packageDirs
  getPackageDirs () {
    return (this.packages || []).map(pkg => [pkg.qualifiedName, pkg.dir])
  }

  isSelected () {
    return !this.programOptions.modules || this.programOptions.modules.includes(this.name)
  }

  async clone () {
    const organization = this.options.organization || this.programOptions.organization
    const url = this.options.url || this.programOptions.url
    const repoUrl = this.git.buildRepoUrl(url, organization, this.name)
    const branch = this.options.branch || (typeof this.programOptions.clone === 'string' ? this.programOptions.clone : '')
    const git = new Git(new Commander(this.programOptions, this.rootDir))
    await git.clone(repoUrl, this.dir, { branch, shallowClone: this.programOptions.shallowClone }, this.name)
  }

  async pull () {
    const organization = this.options.organization || this.programOptions.organization
    const url = this.options.url || this.programOptions.url
    const repoUrl = this.git.buildRepoUrl(url, organization, this.name)
    await this.git.pull(repoUrl, this.name)
  }

  async install () {
    await this.pm.install(this.name, this.options)
    if (this.options.application) {
      await this.resolvePackageManager(path.join(this.dir, 'api')).install(this.name, this.options)
    }
  }

  async link () {
    if (this.packages) {
      if (this.pm.getName() !== 'pnpm' || this.options.forceLink) {
        for (const pkg of this.packages) {
          await this.resolvePackageManager(pkg.dir).link(pkg.name)
        }
      }
    } else {
      await this.pm.link(this.name)
    }
  }

  async unlink () {
    if (this.packages) {
      if (this.pm.getName() !== 'pnpm' || this.options.forceLink) {
        for (const pkg of this.packages) {
          await this.resolvePackageManager(pkg.dir).unlink(pkg.name)
        }
      }
    } else {
      await this.pm.unlink(this.name)
    }
  }

  async linkDependencies (packageDirs) {
    if (this.options.packages) {
      for (const [pkgName, pkgOptions] of Object.entries(this.options.packages)) {
        if (!pkgOptions.dependencies?.length) continue
        const pkg = this.packages?.find(p => p.name === pkgName)
        if (!pkg) continue
        const pm = this.resolvePackageManager(pkg.dir)
        logger.push(pkgName, 'Linking dependencies...')
        for (const dep of pkgOptions.dependencies) {
          await pm.linkDependency(dep, packageDirs[dep])
        }
        logger.pull()
      }
    } else if (this.options.dependencies?.length) {
      logger.push(this.name, 'Linking dependencies...')
      try {
        for (const dep of this.options.dependencies) {
          await this.pm.linkDependency(dep, packageDirs[dep])
        }
      } finally {
        logger.pull()
      }
    }

    if (this.options.application && this.options.dependencies?.length) {
      const apiPm = this.resolvePackageManager(path.join(this.dir, 'api'))
      logger.push(`${this.name} API`, 'Linking dependencies...')
      try {
        for (const dep of this.options.dependencies) {
          await apiPm.linkDependency(dep, packageDirs[dep])
        }
      } finally {
        logger.pull()
      }
    }
  }

  async unlinkDependencies () {
    if (this.options.packages) {
      for (const [pkgName, pkgOptions] of Object.entries(this.options.packages)) {
        if (!pkgOptions.dependencies?.length) continue
        const pkg = this.packages?.find(p => p.name === pkgName)
        if (!pkg) continue
        const pm = this.resolvePackageManager(pkg.dir)
        logger.push(pkgName, 'Unlinking dependencies...')
        for (const dep of pkgOptions.dependencies) {
          await pm.unlinkDependency(dep)
        }
        logger.pull()
      }
    } else if (this.options.dependencies?.length) {
      logger.push(this.name, 'Unlinking dependencies...')
      try {
        for (const dep of this.options.dependencies) {
          await this.pm.unlinkDependency(dep)
        }
      } finally {
        logger.pull()
      }
    }

    if (this.options.application && this.options.dependencies?.length) {
      const apiPm = this.resolvePackageManager(path.join(this.dir, 'api'))
      logger.push(`${this.name} API`, 'Unlinking dependencies...')
      try {
        for (const dep of this.options.dependencies) {
          await apiPm.unlinkDependency(dep)
        }
      } finally {
        logger.pull()
      }
    }
  }
}
