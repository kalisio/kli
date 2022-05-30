#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const makeDebug = require('debug')
const shell = require('shelljs')
const util = require('util')

const debug = makeDebug('kdk')

const exec = util.promisify(require('child_process').exec)
const wait = util.promisify(setTimeout)

async function runCommand (command) {
  if (program.debug) debug('Running command', command)
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
  for (let i = 0; i < dependencies.length; i++) {
    const dependency = dependencies[i]
    try {
      await runCommand(`yarn unlink ${dependency}`)
    } catch (error) {
      console.log(error)
    }
  }
}

async function run (workspace, branch) {
  console.log('Preparing workspace on branch', branch)
  // Process modules
  const modules = Object.keys(workspace)
  for (let i = 0; i < modules.length; i++) {
    const module = modules[i]
    const options = workspace[module]
    if (program.modules && !program.modules.includes(module)) {
      continue
    }
    if (options.branches && !options.branches.includes(branch)) {
      continue
    }
    console.log(`Preparing module ${module}`)
    if (program.clone || program.pull) {
      const cwd = process.cwd()
      // Clone path can be relative to CWD when managing code for different organizations (eg kalisio/weacast)
      // CWD is the root path for the "main" organization usually owing the project
      if (options.path) shell.cd(path.join(cwd, options.path))
      const organization = options.organization || program.organization
      try {
        if (program.clone) {
          // Check if branch is forced on module, otherwise use CLI/default one
          const branch = options.branch || (typeof program.clone === 'string' ? program.clone : 'master')
          await runCommand(`git clone -b ${branch} https://github.com/${organization}/${module}.git`)
        } else {
          shell.cd(`${module}`)
          await runCommand(`git pull`)
        }
      } catch (error) {
        console.log(error)
      }
      shell.cd(cwd)
    }
    const cwd = process.cwd()
    // Working path for module can be relative to CWD when managing code for different organizations (eg kalisio/weacast)
    // CWD is the root path for the "main" organization usually owing the project
    shell.cd(options.path ? path.join(cwd, options.path, `${module}`) : path.join(cwd, `${module}`))
    try {
      if (program.branch) {
        // Check if branch is forced on module, otherwise use CLI one
        const branch = options.branch || program.branch
        await runCommand(`git fetch origin ${branch}:${branch}`)
        await runCommand(`git checkout ${branch}`)
      }
      if (program.install) {
        await runCommand('yarn install --ignore-optional')
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
            await runCommand('yarn install --ignore-optional')
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
      if (options.branches && !options.branches.includes(branch)) {
        continue
      }
      console.log(program.link ? `Linking module ${module}` : `Unlinking module ${module}`)
      const cwd = process.cwd()
      shell.cd(options.path ? path.join(cwd, options.path, `${module}`) : path.join(cwd, `${module}`))
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
    if (options.branches && !options.branches.includes(branch)) {
      continue
    }
    console.log(`Finalizing module ${module}`)
    const cwd = process.cwd()
    // Working path for module can be relative to CWD when managing code for different organizations (eg kalisio/weacast)
    // CWD is the root path for the "main" organization usually owing the project
    shell.cd(options.path ? path.join(cwd, options.path, `${module}`) : path.join(cwd, `${module}`))
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
  .option('-o, --organization [organization]', 'GitHub organization owing the project', 'kalisio')
  .option('-d, --debug', 'Verbose output for debugging')
  .option('-c, --clone [branch]', 'Clone git repositories (with optional target branch)')
  .option('-p, --pull', 'Pull git repositories')
  .option('-i, --install', 'Perform yarn install')
  .option('-l, --link', 'Perform yarn link')
  .option('-ul, --unlink', 'Perform yarn unlink')
  .option('-b, --branch <branch>', 'Switch git branch')
  .option('-m, --modules <modules>', 'Comma separated list of modules from the workspace to apply command on', commaSeparatedList)
  .parse(process.argv)

let workspace = program.args[0]
// When relative path is given assume it relative to working dir
if (!path.isAbsolute(workspace)) workspace = path.join(process.cwd(), workspace)
// Read workspace file
workspace = require(workspace)
run(workspace, program.branch || 'master')
