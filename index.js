#!/usr/bin/env node
import fs from 'node:fs'
import { cac } from 'cac'
import { Workspace } from './workspace.js'

const PACKAGE_CONTENT = JSON.parse(
  fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')
)

const cli = cac('kli')
cli
  .version(PACKAGE_CONTENT.version)
  .option('-o, --organization <org>', 'GitHub organization or GitLab group owing the project', { default: 'kalisio' })
  .option('-u, --url <url>', 'Git server base URL', { default: 'https://github.com' })
  .option('-c, --clone [branch]', 'Clone git repositories (with target branch) for all modules')
  .option('--shallow-clone', 'Perform a shallow clone, ie. will not pull the whole repository history')
  .option('-p, --pull', 'Pull repositories for all modules')
  .option('-i, --install', 'Install dependencies for all modules')
  .option('--check-files', 'Check files during install (yarn only)')
  .option('-l, --link', 'Link packages')
  .option('--link-folder <folder>', 'Specify the folder to use to register yarn links')
  .option('-ul, --unlink', 'Unlink packages')
  .option('-m, --modules <list>', 'Comma separated list of modules')
  .option('--command-output', 'Show command output')
  .option('--fail-on-error', 'Exit on error', { default: false })

const parsed = cli.parse()
const { options: programOptions, args: programArgs } = parsed

if (!programArgs[0] || programOptions.help) {
  cli.outputHelp()
  process.exit(0)
}

if (typeof programOptions.modules === 'string') {
  programOptions.modules = programOptions.modules.split(',')
}

const workspace = await Workspace.load(programArgs[0], programOptions)
await workspace.run()
