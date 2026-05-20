#!/usr/bin/env node
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { cac } from 'cac'
import shell from 'shelljs'
import makeDebug from 'debug'
import { logger } from './logger.js'
import { reporter } from './reporter.js'
import { Commander } from './commander.js'
import { Git } from './git.js'
import { createPackageManager } from './package-managers.js'

const debug = makeDebug('kli')

const PACKAGES_DIRS = {}

// ── Dependency-level operations ───────────────────────────────────────────

async function linkDependencies (module, dependencies, pm) {
  if (!dependencies) return
  logger.push(module, 'Linking dependencies...')
  for (const dependency of dependencies) {
    const dependencyDir = PACKAGES_DIRS[dependency]
    await pm.linkDependency(dependency, dependencyDir)
  }
  logger.pull()
}

async function unlinkDependencies (module, dependencies, pm) {
  if (!dependencies) return
  logger.push(module, 'Unlinking dependencies...')
  for (const dependency of dependencies) {
    await pm.unlinkDependency(dependency)
  }
  logger.pull()
}

// ── Package-level operations (monorepo) ───────────────────────────────────

async function linkPackages (module, packages, pm) {
  if (!packages) return
  logger.push(module, 'Linking packages...')
  for (const pkg of packages) {
    shell.cd(`packages/${pkg}`)
    await pm.link(pkg)
    shell.cd('../..')
  }
  logger.pull()
}

async function unlinkPackages (module, packages, pm) {
  if (!packages) return
  logger.push(module, 'Unlinking packages...')
  for (const pkg of packages) {
    shell.cd(`packages/${pkg}`)
    await pm.unlink(pkg)
    shell.cd('../..')
  }
  logger.pull()
}

// ── Module-level operations ───────────────────────────────────────────────

// Guess the current module package manager
function getModulePackageManager () {
  let pkgManagerField
  if (fs.existsSync('package.json')) {
    const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    pkgManagerField = pkgJson.packageManager
  }
  return createPackageManager(pkgManagerField, programOptions, commander)
}

// Guess whether the current module is a monorepo
function scanModulePackages (options) {
  if (fs.existsSync('packages') && fs.statSync('packages').isDirectory()) {
    const currentDir = process.cwd()
    const files = fs.readdirSync('packages', { withFileTypes: true })
    return files.filter(file => file.isDirectory()).map(file => {
      const organization = options.organization || 'kalisio'
      const packageName = options.prefix ? `${options.prefix}-${file.name}` : file.name
      PACKAGES_DIRS[`@${organization}/${packageName}`] = `${currentDir}/packages/${file.name}`
      return packageName
    })
  }
}

// Enter modules root path defined in module options
function cdRootDir (module, options) {
  const cwd = process.cwd()
  // Clone path can be relative to CWD when managing code for different organizations (eg kalisio/weacast)
  // In this case, CWD is the root path for the "main" organization usually owing the project
  if (options.path) {
    const rootPath = path.isAbsolute(options.path) ? options.path : path.join(cwd, options.path)
    if (!fs.existsSync(rootPath)) fs.mkdirSync(rootPath, { recursive: true })
    debug(`Based on provided path ${options.path} entering`, rootPath)
    shell.cd(rootPath)
  }
}

// Get output module path taking into account module options
function getOutputPath (module, options) {
  return options.output || module
}

// Enter output module path taking into account module options
function cdOutputDir (module, options) {
  const cwd = process.cwd()
  const output = getOutputPath(module, options)
  // Working path for module can be relative to CWD when managing code for different organizations (eg kalisio/weacast)
  // In this case, CWD is the root path for the "main" organization usually owning the project
  let outputPath = path.join(cwd, `${output}`)
  if (options.path) {
    outputPath = path.isAbsolute(options.path) ? path.join(options.path, `${output}`) : path.join(cwd, options.path, `${output}`)
  }
  debug(`Based on provided path ${options.path} entering`, outputPath)
  shell.cd(outputPath)
}

// ── Main run ───────────────────────────────────────────

async function run (workspace) {
  const modules = Object.keys(workspace)
  for (const module of modules) {
    const options = workspace[module]
    if (programOptions.modules && !programOptions.modules.includes(module)) {
      continue
    }
    logger.info(`Preparing ${module}`)

    // Process clone or pull commands
    if (programOptions.clone || programOptions.pull) {
      const cwd = process.cwd()
      cdRootDir(module, options)
      const organization = options.organization || programOptions.organization
      const url = options.url || programOptions.url
      const repoUrl = git.buildRepoUrl(url, organization, module)
      const output = getOutputPath(module, options)
      if (programOptions.clone) {
        const branch = options.branch || (typeof programOptions.clone === 'string' ? programOptions.clone : '')
        await git.clone(repoUrl, output, { branch, shallowClone: options.shallowClone }, module, fs.existsSync(output))
      } else {
        cdOutputDir(module, options)
        await git.pull(repoUrl, module)
      }
      shell.cd(cwd)
    }

    // Process switch/install or link commands
    const cwd = process.cwd()
    cdOutputDir(module, options)
    try {
      const packageManager = getModulePackageManager()
      const packages = scanModulePackages(options)
      if (programOptions.branch || programOptions.switch) {
        // Check if branch is forced on module, otherwise use CLI one
        const branch = options.branch || programOptions.branch
        if (branch) await git.switch(branch, module)
      }
      if (programOptions.install) {
        await packageManager.install(module, options)
      }
      if (!options.application && programOptions.link) {
        // Mono repo
        if (packages) {
          if (packageManager.getName() !== 'pnpm' || options.forceLink) {
            await linkPackages(module, packages, packageManager)
          }
        } else {
          packageManager.link(module)
        }
      }
      if (options.application) {
        shell.cd('api')
        if (programOptions.install) {
          await packageManager.install(module, options)
        }
        shell.cd('..')
      }
    } catch (error) {
      logger.negative(error)
    }
    shell.cd(cwd)
  }

  // Now everything is installed process dependencies link/unlink
  if (programOptions.link || programOptions.unlink) {
    for (const module of modules) {
      const options = workspace[module]
      const cwd = process.cwd()
      cdOutputDir(module, options)
      const packageManager = getModulePackageManager()
      // Mono repo
      if (options.packages) {
        const packages = Object.keys(options.packages)
        for (const pkg of packages) {
          const pkgOptions = options.packages[pkg]
          shell.cd(`packages/${pkg}`)
          if (programOptions.link) {
            await linkDependencies(pkg, pkgOptions.dependencies, packageManager)
          } else {
            await unlinkDependencies(pkg, pkgOptions.dependencies, packageManager)
          }
          shell.cd('../..')
        }
      } else if (programOptions.link) {
        await linkDependencies(module, options.dependencies, packageManager)
      } else {
        await unlinkDependencies(module, options.dependencies, packageManager)
      }
      if (options.application) {
        shell.cd('api')
        if (programOptions.link) {
          await linkDependencies(`${module} API`, options.dependencies, packageManager)
        } else {
          await unlinkDependencies(`${module} API`, options.dependencies, packageManager)
        }
        shell.cd('..')
      }
      shell.cd(cwd)
    }
  }

  for (const module of modules) {
    const options = workspace[module]
    if (programOptions.modules && !programOptions.modules.includes(module)) {
      continue
    }
    logger.info(`Finalizing ${module}`)
    const cwd = process.cwd()
    cdOutputDir(module, options)
    try {
      const packageManager = getModulePackageManager()
      const packages = scanModulePackages(options)
      // Now we have unlinked removed global links
      if (!options.application && programOptions.unlink) {
        // Mono repo
        if (packages) {
          if (packageManager.getName() !== 'pnpm' || options.forceLink) {
            await unlinkPackages(module, packages, packageManager)
          }
        } else {
          await packageManager.unlink(module)
        }
      }
    } catch (error) {
      logger.negative(error)
    }
    shell.cd(cwd)
  }

  // Report
  reporter.report()
}

// ── CLI ───────────────────────────────────────────────────────────────────

const PACKAGE_CONTENT = JSON.parse(
  fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')
)

const cli = cac('kli')
cli
  .version(PACKAGE_CONTENT.version)
  .option('-o, --organization <org>', 'git org')
  .option('-u, --url <url>', 'git url')
  .option('-c, --clone [branch]', 'Clone repositories')
  .option('-p, --pull', 'Pull repositories')
  .option('-i, --install', 'Install dependencies')
  .option('-l, --link', 'Link packages')
  .option('-ul, --unlink', 'Unlink packages')
  .option('-m, --modules <list>', 'Comma separated list of modules', v => v.split(','))
  .option('--check-files', 'Check files during install (yarn only)')
  .option('--command-output', 'Show command output')
  .option('--fail-on-error', 'Exit on error', false)

const parsed = cli.parse()
const { options: programOptions, args: programArgs } = parsed

if (!programArgs[0] || programOptions.help) {
  cli.outputHelp()
  process.exit(0)
}

const commander = new Commander(programOptions)
const git = new Git(commander)

const workspaceFilePath = programArgs[0]
const workspace = await import(pathToFileURL(path.resolve(workspaceFilePath)).href)
  .then(m => m.default ?? m)

await run(workspace)
