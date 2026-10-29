import fs from 'node:fs'
import { Command } from 'commander'
import { Workspace } from './workspace.js'

export function processArgsOptions () {
  const PACKAGE_CONTENT = JSON.parse(
    fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')
  )

  const program = new Command('kli')
  program
    .version(PACKAGE_CONTENT.version)
    .usage('<workspacefile> [options]')
    .argument('[workspacefile]')
    .option('-o, --organization <org>', 'GitHub organization or GitLab group owing the project', 'kalisio')
    .option('-u, --url <url>', 'Git server base URL', 'https://github.com')
    .option('-c, --clone [branch]', 'Clone git repositories (branch used for modules without a branch in the workspace)')
    .option('--shallow-clone', 'Perform a shallow clone, ie. will not pull the whole repository history')
    .option('-p, --pull', 'Pull repositories for all modules')
    .option('-i, --install', 'Install dependencies for all modules')
    .option('--check-files', 'Check files during install (yarn only)')
    .option('-l, --link', 'Link packages')
    .option('--link-folder <folder>', 'Specify the folder to use to register yarn links')
    .option('--unlink', 'Unlink packages')
    .option('-m, --modules <list>', 'Comma separated list of modules', list => list.split(','))
    .option('--production', 'Exclude development dependencies', false)
    .option('--command-output', 'Show command output')
    .option('--fail-on-error', 'Exit on error', false)
    // Previous versions ignored unknown options and extra arguments
    .allowUnknownOption()
    .allowExcessArguments()
    // commander only accepts single-character short options: '-ul' is handled below, show it in help
    .configureHelp({ optionTerm: option => option.long === '--unlink' ? '-ul, --unlink' : option.flags })

  // Legacy syntaxes accepted by previous versions: '-ul' means '--unlink',
  // and grouped short flags are separate flags ('-ci' is '-c -i', not branch 'i')
  const argv = process.argv.flatMap(arg => {
    if (arg === '-ul') return ['--unlink']
    if (/^-[a-zA-Z]{2,}$/.test(arg)) return [...arg.slice(1)].map(flag => `-${flag}`)
    return [arg]
  })
  program.parse(argv)

  const programArgs = program.args
  const programOptions = program.opts()
  if (!programArgs[0]) {
    program.outputHelp()
    process.exit(0)
  }

  return { programArgs, programOptions }
}

export async function cli (workspaceFilePath, options) {
  const workspace = await Workspace.load(workspaceFilePath, options)
  await workspace.run()
}
