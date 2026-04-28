#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const util = require('util')
const program = require('commander')
const boxenModule = require('boxen')
const makeDebug = require('debug')
const shell = require('shelljs')
const chalk = require('chalk')

const debug = makeDebug('kli')
const boxen = boxenModule.default

const exec = util.promisify(require('child_process').exec)
const wait = util.promisify(setTimeout)

// Store packages path
const PACKAGES_DIRS = {}

// All errors appearing during execution organized by module
const ERRORS = {}

async function runCommand (command, module) {
  debug('Running command', command)
  try {
    const { stdout, stderr } = await exec(command)
    if (program.commandOutput) console.log(stdout.trim())
    console.error(stderr.trim())
  } catch (error) {
    // command failed, either --no-fail-on-error is set and we rethrow the exception
    // or it's not set and we exit now
    if (program.failOnError) {
      console.error(error)
      console.error('Command failed and --no-fail-on-error is not set, exiting ...')
      process.exit(1)
    } else {
      if (ERRORS[module]) ERRORS[module].push(error)
      else ERRORS[module] = [error]
      throw error
    }
  }
  await wait(1000) // Wait a couple of seconds to ensure files are closed
}

async function installModule (module, options, packageManager) {
  let opts = ''
  let cmd
  if (packageManager === 'pnpm') {
    cmd = 'pnpm install'
    if (program.force) opts += '--force'
  } else {
    cmd = 'yarn install'
    if (program.checkFiles) opts += '--check-files'
    if (options.ignoreOptional === undefined || options.ignoreOptional === true) opts += ' --ignore-optional'
  }
  try {
    await runCommand(`${cmd} ${opts}`, module)
    console.log(chalk.green(`✅ Module ${module} installed`))
  } catch (error) {
    console.log(chalk.red(`❌ Installing module ${module} failed:`, error))
  }
}

// Guess the current module package manager
function getModulePackageManager () {
  if (fs.existsSync('package.json')) {
    const pkgJson = JSON.parse(fs.readFileSync('package.json'))
    const packageManager = pkgJson.packageManager
    if (packageManager && packageManager.includes('pnpm')) return 'pnpm'
    return 'yarn'
  }
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

async function linkModule (module, packageManager) {
  const cmd = packageManager === 'pnpm'
    ? `ln -s "$(pwd)" "$(yarn global dir)/${module}"`
    : `yarn link ${program.linkFolder ? '--link-folder ' + program.linkFolder : ''}`
  try {
    await runCommand(cmd, module)
    console.log(chalk.green(`✅ Module ${module} linked`))
  } catch (error) {
    console.log(chalk.red(`❌ Linking  module ${module} failed:`, error))
  }
}

async function unlinkModule (module, packageManager) {
  const cmd = packageManager === 'pnpm'
    ? `rm -f "$(yarn global dir)/${module}"`
    : `yarn unlink ${program.linkFolder ? '--link-folder ' + program.linkFolder : ''}`
  try {
    await runCommand(cmd, module)
    console.log(chalk.green(`✅ Module ${module} unlinked`))
  } catch (error) {
    console.log(chalk.red(`❌ Unlinking module ${module} failed:`, error))
  }
}

async function linkPackages (packages, packageManager) {
  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i]
    console.log(`Linking global module ${pkg}`)
    shell.cd(`packages/${pkg}`)
    try {
      await linkModule(pkg, packageManager)
    } catch (error) {
      console.log(error)
    }
    shell.cd('../..')
  }
}

async function unlinkPackages (packages, packageManager) {
  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i]
    console.log(`Unlinking global module ${pkg}`)
    shell.cd(`packages/${pkg}`)
    try {
      await unlinkModule(pkg, packageManager)
    } catch (error) {
      console.log(error)
    }
    shell.cd('../..')
  }
}

async function linkDependencies (dependencies, packageManager) {
  if (!dependencies) dependencies = []
  for (let i = 0; i < dependencies.length; i++) {
    const dependency = dependencies[i]
    let cmd
    if (packageManager === 'pnpm') {
      const dependencyDir = PACKAGES_DIRS[dependency]
      cmd = `rm -f node_modules/${dependency} && ln -s ${dependencyDir} node_modules/${dependency}`
    } else {
      cmd = `yarn link ${dependency} ${program.linkFolder ? '--link-folder ' + program.linkFolder : ''}`
    }
    try {
      await runCommand(cmd, dependency)
      console.log(chalk.green(`✅ Dependency ${dependency} linked`))
    } catch (error) {
      console.log(chalk.red(`❌ Linking dependency ${dependency} failed:`, error))
    }
  }
}

async function unlinkDependencies (dependencies, packageManager) {
  if (!dependencies) dependencies = []
  for (let i = 0; i < dependencies.length; i++) {
    const dependency = dependencies[i]
    const cmd = packageManager === 'pnpm'
      ? `rm -fr node_modules/${dependency} && pnpm install`
      : `yarn unlink ${dependency} ${program.linkFolder ? '--link-folder ' + program.linkFolder : ''}`
    try {
      await runCommand(cmd, dependency)
      console.log(chalk.green(`✅ Dependency ${dependency} unlinked`))
    } catch (error) {
      console.log(chalk.red(`❌ Unlinking dependency ${dependency} failed:`, error))
    }
  }
}

// Enter modules root path defined in module options
function cdRootPath (module, options) {
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

// Enter output module path defined in module options
function cdOutputPath (module, options) {
  const cwd = process.cwd()
  const output = options.output || module
  // Working path for module can be relative to CWD when managing code for different organizations (eg kalisio/weacast)
  // In this case, CWD is the root path for the "main" organization usually owing the project
  let outputPath = path.join(cwd, `${output}`)
  if (options.path) {
    outputPath = path.isAbsolute(options.path) ? path.join(options.path, `${output}`) : path.join(cwd, options.path, `${output}`)
  }
  debug(`Based on provided path ${options.path} entering`, outputPath)
  shell.cd(outputPath)
}

async function run (workspace) {
  // Process modules
  const modules = Object.keys(workspace)
  for (let i = 0; i < modules.length; i++) {
    const module = modules[i]
    const options = workspace[module]
    // Output dir is relative to modules root path
    const output = options.output || module
    if (program.modules && !program.modules.includes(module)) {
      continue
    }
    console.log(`Preparing module ${module}`)
    if (program.clone || program.pull) {
      const cwd = process.cwd()
      cdRootPath(module, options)
      const organization = options.organization || program.organization
      const url = options.url || program.url
      // git accepts url of the following form (see https://git-scm.com/docs/git-clone#_git_urls) :
      //  - ssh://[user@]host.xz[:port]/path/to/repo.git/
      //  - git://host.xz[:port]/path/to/repo.git/
      //  - http[s]://host.xz[:port]/path/to/repo.git/
      //  - ftp[s]://host.xz[:port]/path/to/repo.git/
      // they all start with the uri scheme, host [:port] and then /path
      // but it also accepts url of the form:
      //   [user@]host.xz:path/to/repo.git/
      // where there's no port and path follows ':'
      const repoUrl = url + (url.indexOf('://') !== -1 ? '/' : ':') + organization + '/' + module + '.git'
      debug('Repository URL is:', repoUrl)
      try {
        if (program.clone) {
          if (!fs.existsSync(output)) {
            // Check if branch is forced on module, otherwise use CLI/default one
            const branch = options.branch || (typeof program.clone === 'string' ? program.clone : '')
            const gitopts = ['--recurse-submodules']
            if (branch) gitopts.push(`--branch ${branch}`)
            if (options.shallowClone) {
              gitopts.push('--depth 1')
              gitopts.push('--shallow-submodules')
            }
            await runCommand(`git clone ${gitopts.join(' ')} ${repoUrl} ${output}`, module)
          } else {
            console.log(`Skipping module ${module}. Module already cloned.`)
          }
        } else {
          cdOutputPath(module, options)
          // This ensure that if the URL has changed, eg included token, everything will still work correctly
          await runCommand(`git remote set-url origin ${repoUrl}`, module)
          await runCommand('git pull --recurse-submodules --rebase', module)
        }
      } catch (error) {
        console.log(error)
      }
      shell.cd(cwd)
    }
    const cwd = process.cwd()
    cdOutputPath(module, options)
    try {
      const packageManager = getModulePackageManager()
      const packages = scanModulePackages(options)
      if (program.branch || program.switch) {
        // Check if branch is forced on module, otherwise use CLI one
        const branch = options.branch || program.branch
        if (branch) {
          await runCommand(`git fetch origin ${branch}`, module)
          await runCommand(`git checkout ${branch}`, module)
        }
      }
      if (program.install) {
        await installModule(module, options, packageManager)
      }
      if (!options.application && program.link) {
        // Mono repo
        if (packages) {
          if (packageManager !== 'pnpm' || options.forceLink) {
            console.log(`Linking packages from module ${module}`)
            await linkPackages(packages, packageManager)
          }
        } else {
          console.log(`Linking global module ${module}`)
          await linkModule(module, packageManager)
        }
      }
      if (options.application) {
        shell.cd('api')
        try {
          if (program.install) {
            await installModule(module, options, packageManager)
          }
        } catch (error) {
          console.log(error)
        }
        shell.cd('..')
      }
    } catch (error) {
      console.log(error)
    }
    shell.cd(cwd)
  }
  // Now everything is installed process with links
  if (program.link || program.unlink) {
    for (let i = 0; i < modules.length; i++) {
      const module = modules[i]
      const options = workspace[module]
      console.log(program.link ? `Linking module ${module}` : `Unlinking module ${module}`)
      const cwd = process.cwd()
      cdOutputPath(module, options)
      const packageManager = getModulePackageManager()
      // Mono repo
      if (options.packages) {
        const packages = Object.keys(options.packages)
        for (let i = 0; i < packages.length; i++) {
          const pkg = packages[i]
          const packageOptions = options.packages[pkg]
          shell.cd(`packages/${pkg}`)
          if (program.link) {
            await linkDependencies(packageOptions.dependencies, packageManager)
          } else {
            await unlinkDependencies(packageOptions.dependencies, packageManager)
          }
          shell.cd('../..')
        }
      } else if (program.link) {
        await linkDependencies(options.dependencies, packageManager)
      } else {
        await unlinkDependencies(options.dependencies, packageManager)
      }
      if (options.application) {
        shell.cd('api')
        if (program.link) {
          await linkDependencies(options.dependencies, packageManager)
        } else {
          await unlinkDependencies(options.dependencies, packageManager)
        }
        shell.cd('..')
      }
      shell.cd(cwd)
    }
  }

  for (let i = 0; i < modules.length; i++) {
    const module = modules[i]
    const options = workspace[module]
    if (program.modules && !program.modules.includes(module)) {
      continue
    }
    console.log(`Finalizing module ${module}`)
    const cwd = process.cwd()
    cdOutputPath(module, options)
    try {
      const packageManager = getModulePackageManager()
      const packages = scanModulePackages(options)
      // Now we have unlinked removed global links
      if (!options.application && program.unlink) {
        // Mono repo
        if (packages) {
          if (packageManager !== 'pnpm' || options.forceLink) {
            console.log(`Unlinking packages from module ${module}`)
            await unlinkPackages(packages, packageManager)
          }
        } else {
          console.log(`Unlinking global module ${module}`)
          await unlinkModule(module, packageManager)
        }
      }
    } catch (error) {
      console.log(error)
    }
    shell.cd(cwd)
  }
  // Error summary
  const nbErrors = Object.keys(ERRORS).length
  if (nbErrors > 0) {
    console.log(boxen('Encountered errors during execution, you might review it below', {
      title: (nbErrors === 1 ? `${nbErrors} error` : `${nbErrors} errors`),
      titleAlignment: 'center',
      width: 80,
      padding: { top: 1, bottom: 1 }
    }))
    for (const [module, moduleErrors] of Object.entries(ERRORS)) {
      console.log(boxen(moduleErrors.map(error => error.stderr || error).join(''), {
        title: (moduleErrors.length === 1 ? `${module} : ${moduleErrors.length} error` : `${module} : ${moduleErrors.length} errors`),
        titleAlignment: 'center',
        width: 80,
        padding: { top: 1, bottom: 1 }
      }))
    }
  }
}

function commaSeparatedList (values) {
  return values.split(',')
}

program
  .version(require('./package.json').version)
  .usage('<workspacefile> [options]')
  .option('-o, --organization [organization]', 'GitHub organization or GitLab group owing the project', 'kalisio')
  .option('-u, --url [url]', 'Git server base URL', 'https://github.com')
  .option('-c, --clone [branch]', 'Clone git repositories (with  target branch) for all modules')
  .option('--shallow-clone', 'Perform a shallow clone, ie. will not pull the whole repository history')
  .option('-p, --pull', 'Pull git repositories for all modules')
  .option('-i, --install', 'Perform yarn install for all modules')
  .option('--check-files', 'Use --check-files flag when running yarn install')
  .option('-l, --link', 'Perform yarn link for all modules')
  .option('--link-folder <folder>', 'Specify the folder to use to register yarn links')
  .option('-ul, --unlink', 'Perform yarn unlink for all modules')
  .option('-b, --branch <branch>', 'Switch to target git branch in all modules where it does exist')
  .option('-s, --switch', 'Switch all modules to the default git branch specified in workspace (if any)')
  .option('-m, --modules <modules>', 'Comma separated list of modules from the workspace to apply command on', commaSeparatedList)
  .option('--no-fail-on-error', 'If not set, the kli will return an error code if some underlying command fail')
  .option('--command-output', 'Display command output')
  .parse(process.argv)

let workspace = program.args[0]
// When relative path is given assume it relative to working dir
if (!path.isAbsolute(workspace)) workspace = path.join(process.cwd(), workspace)
console.log('Preparing workspace', workspace)
// Read workspace file
workspace = require(workspace)
run(workspace)
