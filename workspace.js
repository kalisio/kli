import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import makeDebug from 'debug'
import { Module } from './module.js'
import { reporter } from './reporter.js'
import { logger } from './logger.js'

const debug = makeDebug('kli')

export class Workspace {
  constructor (config, programOptions) {
    this.programOptions = programOptions
    this.selectedModules = Object.entries(config)
      .filter(([name, options]) =>
        (!programOptions.modules || programOptions.modules.includes(name)) &&
        (!programOptions.production || !options.devDependency)
      )
      .map(([name, options]) => new Module(name, options, programOptions))
    this.packageDirs = {}
    debug(`Selected modules: ${this.selectedModules.map(m => m.name).join(', ')}`)
  }

  async run () {
    // Step 1 — Clone/pull repositories
    for (const mod of this.selectedModules) {
      logger.info(`Preparing ${mod.name}`)
      try {
        if (this.programOptions.clone) await mod.clone()
        if (this.programOptions.pull) await mod.pull()
      } catch (error) {
        if (this.programOptions.failOnError) throw error
      }
    }

    // Step 2 — Discover packages
    const discoveredModules = []
    for (const mod of this.selectedModules) {
      try {
        mod.discover()
        discoveredModules.push(mod)
      } catch (error) {
        reporter.addError(mod.name, error)
        if (this.programOptions.failOnError) {
          reporter.report()
          return
        }
      }
    }
    this.selectedModules = discoveredModules
    this.packageDirs = Object.fromEntries(
      this.selectedModules.flatMap(m => m.getPackageDirs())
    )

    // Step 3 - Generate pnpm hook
    if (this.programOptions.install) {
      const targets = {
        ...Object.fromEntries(
          this.selectedModules
            .filter(m => m.package.name)
            .map(m => [m.package.name, m.dir])
        ),
        ...this.packageDirs
      }
      const template = fs.readFileSync(new URL('./pnpmfile.cjs.template', import.meta.url), 'utf8')
      for (const mod of this.selectedModules) {
        if (mod.pm.getName() !== 'pnpm') continue
        const links = mod.generateLinks(targets)
        const files = [path.join(mod.dir, '.pnpmfile.cjs')]
        if (mod.options.application) {
          files.push(path.join(mod.dir, 'api', '.pnpmfile.cjs'))
        }
        if (Object.keys(links).length === 0) {
          for (const file of files) fs.rmSync(file, { force: true })
          continue
        }
        const content = template.replace('__LINKS__', JSON.stringify(links, null, 2))
        for (const file of files) fs.writeFileSync(file, content)
      }
    }

    // Step 4 — Install and link packages
    for (const mod of this.selectedModules) {
      try {
        if (this.programOptions.install) await mod.install()
        if (this.programOptions.link) await mod.link()
      } catch (error) {
        if (this.programOptions.failOnError) throw error
      }
    }

    // Step 5 — Link/unlink dependencies (Yarn)
    if (this.programOptions.link || this.programOptions.unlink) {
      for (const mod of this.selectedModules) {
        try {
          if (this.programOptions.link) await mod.linkDependencies(this.packageDirs)
          else await mod.unlinkDependencies()
        } catch (error) {
          if (this.programOptions.failOnError) throw error
        }
      }
    }

    // Step 6 — Unlink packages
    for (const mod of this.selectedModules) {
      logger.info(`Finalizing ${mod.name}`)
      try {
        if (this.programOptions.unlink) await mod.unlink()
      } catch (error) {
        if (this.programOptions.failOnError) throw error
      }
    }

    reporter.report()
  }

  static async load (workspaceFilePath, programOptions = { organization: 'kalisio', url: 'https://github.com' }) {
    const resolvedPath = path.resolve(workspaceFilePath)
    if (!fs.existsSync(resolvedPath)) {
      logger.negative(`Workspace file not found: ${resolvedPath}`)
      process.exit(1)
    }
    try {
      const config = await import(pathToFileURL(resolvedPath).href)
        .then(m => m.default ?? m)
      if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
        logger.negative(`Workspace file is empty or invalid: ${resolvedPath}`)
        process.exit(1)
      }
      return new Workspace(config, programOptions)
    } catch (error) {
      logger.negative(`Failed to load workspace file: ${error.message}`)
      process.exit(1)
    }
  }
}
