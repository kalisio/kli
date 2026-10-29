import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { processArgsOptions, cli } from './cli.js'

export * from './module.js'
export * from './package-managers.js'
export * from './workspace.js'
export * from './cli.js'

// Check if executed by node or imported (real paths: robust to symlinks and special characters)
function isExecuted () {
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isExecuted()) {
  const { programArgs, programOptions } = processArgsOptions()
  await cli(programArgs[0], programOptions)
}
