import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { Module } from './module.js'
import { reporter } from './reporter.js'
import { logger } from './logger.js'

export class Workspace {
  constructor (config, programOptions) {
    this.programOptions = programOptions
    this.modules = Object.entries(config)
      .map(([name, options]) => new Module(name, options, programOptions))
    this.packageDirs = Object.fromEntries(
      this.modules.flatMap(m => m.getPackageDirs())
    )
  }

  get selectedModules () {
    return this.modules.filter(m => m.isSelected())
  }

  async run () {
    // Step 1 — clone/pull + install + link packages
    for (const mod of this.selectedModules) {
      logger.info(`Preparing ${mod.name}`)
      try {
        if (this.programOptions.clone) await mod.clone()
        if (this.programOptions.pull) await mod.pull()
        if (this.programOptions.install) await mod.install()
        if (this.programOptions.link) await mod.link()
      } catch (error) {
        if (this.programOptions.failOnError) throw error
      }
    }
    // Step 2 — link/unlink dependencies
    if (this.programOptions.link || this.programOptions.unlink) {
      for (const mod of this.modules) {
        try {
          if (this.programOptions.link) await mod.linkDependencies(this.packageDirs)
          else await mod.unlinkDependencies()
        } catch (error) {
          if (this.programOptions.failOnError) throw error
        }
      }
    }
    // Step 3 — unlink packages
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

  static async load (workspaceFilePath, programOptions) {
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
