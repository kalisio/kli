#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const fs = require('fs')
const makeDebug = require('debug')
const shell = require('shelljs')
const util = require('util')

const debug = makeDebug('kli')

const exec = util.promisify(require('child_process').exec)
const wait = util.promisify(setTimeout)

async function runCommand (command) {
  debug('Running command', command)
  const { stdout, stderr } = await exec(command)
  console.log(stdout)
  console.error(stderr)
  await wait(2000) // Wait a couple of seconds to ensure files are closed
}

async function linkPackages(packages) {
  for (let i = 0; i < packages.length; i++) {
    const package = packages[i]
    console.log(`Linking global module ${package}`)
    shell.cd(`packages/${package}`)
    await runCommand('yarn link')
    shell.cd('../..')
  }
}

async function unlinkPackages(packages) {
  for (let i = 0; i < packages.length; i++) {
    const package = packages[i]
    console.log(`Unlinking global module ${package}`)
    shell.cd(`packages/${package}`)
    await runCommand('yarn unlink')
    shell.cd('../..')
  }
}

async function linkDependencies(dependencies) {
  if (!dependencies) dependencies = []
  for (let i = 0; i < dependencies.length; i++) {
    const dependency = dependencies[i]
    try {
      await runCommand(`yarn link ${dependency}`)
    } catch (error) {
      console.log(error)
    }
  }
}

async function unlinkDependencies(dependencies) {
  if (!dependencies) dependencies = []
  for (let i = 0; i < dependencies.length; i++) {
    const dependency = dependencies[i]
    try {
      await runCommand(`yarn unlink ${dependency}`)
    } catch (error) {
      console.log(error)
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
      try {
        if (program.clone) {
          if (!fs.existsSync(output)) {
            // Check if branch is forced on module, otherwise use CLI/default one
            const branch = options.branch || (typeof program.clone === 'string' ? program.clone : '')
            const url = options.url || program.url
            const giturl = url + (url.startsWith('http') ? '/' : ':')
            if (branch) {
              console.log(`Cloning branch ${branch} of module ${module} (including submodules)`)
              await runCommand(`git clone --recurse-submodules -b ${branch} ${giturl}${organization}/${module}.git ${output}`)
            } 
            else await runCommand(`git clone --recurse-submodules ${giturl}${organization}/${module}.git ${output}`)
          } else {
            console.log(`Skipping module ${module}. Module already cloned.`)
          }
        } else {
          cdOutputPath(module, options)
          await runCommand(`git pull --recurse-submodules --rebase`)
        }
      } catch (error) {
        console.log(error)
      }
      shell.cd(cwd)
    }
    const cwd = process.cwd()
    cdOutputPath(module, options)
    try {
      if (program.branch || program.switch) {
        // Check if branch is forced on module, otherwise use CLI one
        const branch = options.branch || program.branch
        if (branch) {
          await runCommand(`git fetch origin ${branch}`)
          await runCommand(`git checkout ${branch}`)
        }
      }
      if (program.install) {
        await runCommand('yarn install --ignore-optional --check-files')
      }
      if (!options.application && program.link) {
        // Mono repo
        if (options.packages) {
          console.log(`Linking packages from module ${module}`)
          await linkPackages(Object.keys(options.packages))
        } else {
          console.log(`Linking global module ${module}`)
          await runCommand('yarn link')
        }
      }
      if (options.application) {
        shell.cd('api')
        try {
          if (program.install) {
            await runCommand('yarn install --ignore-optional --check-files')
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
      // Mono repo
      if (options.packages) {
        const packages = Object.keys(options.packages)
        for (let i = 0; i < packages.length; i++) {
          const package = packages[i]
          const packageOptions = options.packages[package]
          shell.cd(`packages/${package}`)
          if (program.link) {
            await linkDependencies(packageOptions.dependencies)
          } else {
            await unlinkDependencies(packageOptions.dependencies)
          }
          shell.cd('../..')
        }
      } else if (program.link) {
        await linkDependencies(options.dependencies)
      } else {
        await unlinkDependencies(options.dependencies)
      }
      if (options.application) {
        shell.cd('api')
        if (program.link) {
          await linkDependencies(options.dependencies)
        } else {
          await unlinkDependencies(options.dependencies)
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
      // Now we have unlinked removed global links
      if (!options.application && program.unlink) {
        // Mono repo
        if (options.packages) {
          console.log(`Unlinking packages from module ${module}`)
          await unlinkPackages(Object.keys(options.packages))
        } else {
          console.log(`Unlinking global module ${module}`)
          await runCommand('yarn unlink')
        }
      }
    } catch (error) {
      console.log(error)
    }
    shell.cd(cwd)
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
  .option('-d, --debug', 'Verbose output for debugging')
  .option('-c, --clone [branch]', 'Clone git repositories (with  target branch) for all modules')
  .option('-p, --pull', 'Pull git repositories for all modules')
  .option('-i, --install', 'Perform yarn install for all modules')
  .option('-l, --link', 'Perform yarn link for all modules')
  .option('-ul, --unlink', 'Perform yarn unlink for all modules')
  .option('-b, --branch <branch>', 'Switch to target git branch in all modules where it does exist')
  .option('-s, --switch', 'Switch all modules to the default git branch specified in workspace (if any)')
  .option('-m, --modules <modules>', 'Comma separated list of modules from the workspace to apply command on', commaSeparatedList)
  .parse(process.argv)

console.log('fuck')
process.env.DEBUG="kli*"
let workspace = program.args[0]
// When relative path is given assume it relative to working dir
if (!path.isAbsolute(workspace)) workspace = path.join(process.cwd(), workspace)
console.log('Preparing workspace', workspace)
// Read workspace file
workspace = require(workspace)
run(workspace)
