import { processArgsOptions, cli } from './cli.js'

export * from './module.js'
export * from './package-managers.js'
export * from './workspace.js'
export * from './cli.js'

// Check if executed by node or imported
if (import.meta.url === `file://${process.argv[1]}`) {
  const { programArgs, programOptions } = processArgsOptions()
  await cli(programArgs[0], programOptions)
}
