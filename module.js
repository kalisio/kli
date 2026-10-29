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

  resolvePackage (dir) {
    const pkgJsonPath = path.join(dir, 'package.json')
    let pkg = {}
    if (fs.existsSync(pkgJsonPath)) {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    }
    return pkg
  }

  resolvePackageManager (dir) {
    const pkgJsonPath = path.join(dir, 'package.json')
    let pkgManagerField
    if (fs.existsSync(pkgJsonPath)) {
      pkgManagerField = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).packageManager
    }
    return createPackageManager(pkgManagerField, this.programOptions, new Commander(this.programOptions, dir))
  }

  discover () {
    const pkgJsonPath = path.join(this.dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      throw new Error(`[${this.name}] Missing package.json: ${pkgJsonPath}`)
    }
    this.package = this.resolvePackage(this.dir)
    this.pm = this.resolvePackageManager(this.dir)
    debug(`[${this.name}] package manager: ${this.pm.getName()}`)
    // Scan packages
    const packagesDir = path.join(this.dir, 'packages')
    this.packages = null
    if (!fs.existsSync(packagesDir)) return
    const organization = this.options.organization || this.programOptions.organization || 'kalisio'
    this.packages = fs.readdirSync(packagesDir, { withFileTypes: true })
      .filter(f => f.isDirectory())
      .map(f => {
        const packageName = this.options.prefix ? `${this.options.prefix}-${f.name}` : f.name
        return {
          name: f.name,
          qualifiedName: `@${organization}/${packageName}`,
          dir: path.join(packagesDir, f.name)
        }
      })
    debug(`[${this.name}] packages: ${this.packages.map(p => p.qualifiedName).join(', ')}`)
  }

  // Expose package dirs for Workspace.packageDirs
  getPackageDirs () {
    return (this.packages || []).map(pkg => [pkg.qualifiedName, pkg.dir])
  }

  // Generate links to feed pnpm hook
  generateLinks (targets) {
    const links = {}
    const addLinks = (name, dir, dependencies = []) => {
      if (!name) return
      const resolved = {}
      for (const dependency of dependencies) {
        const target = targets[dependency]
        if (!target) {
          logger.warning(`[${this.name}] Link skipped for ${dependency}: target not found`)
          continue
        }
        const relative = path.relative(dir, target).split(path.sep).join('/')
        resolved[dependency] = `link:${relative}`
      }
      if (Object.keys(resolved).length) {
        links[name] = resolved
        debug(`[${this.name}] generated links for ${name}`)
      }
    }
    // Root package
    addLinks(this.package.name, this.dir, this.options.dependencies)
    // Monorepo packages
    for (const [name, options] of Object.entries(this.options.packages || {})) {
      const pkg = this.packages?.find(p => p.name === name)
      if (pkg) addLinks(pkg.qualifiedName, pkg.dir, options.dependencies)
    }
    // Application API
    if (this.options.application) {
      const dir = path.join(this.dir, 'api')
      const pkg = this.resolvePackage(dir)
      addLinks(pkg.name, dir, this.options.dependencies)
    }
    return links
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
      await this.resolvePackageManager(path.join(this.dir, 'api')).install(`${this.name}/api`, this.options)
    }
  }

  async link () {
    if (this.pm.getName() === 'pnpm') return
    if (this.packages) {
      for (const pkg of this.packages) {
        await this.resolvePackageManager(pkg.dir).link(pkg.name)
      }
    } else {
      await this.pm.link(this.name)
    }
  }

  async unlink () {
    if (this.pm.getName() === 'pnpm') return
    if (this.packages) {
      for (const pkg of this.packages) {
        await this.resolvePackageManager(pkg.dir).unlink(pkg.name)
      }
    } else {
      await this.pm.unlink(this.name)
    }
  }

  async linkDependencies (packageDirs) {
    if (this.pm.getName() === 'pnpm') return
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
    if (this.pm.getName() === 'pnpm') return
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
