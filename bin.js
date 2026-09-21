#!/usr/bin/env node
import { processArgsOptions, cli } from './cli.js'

const { programArgs, programOptions } = processArgsOptions()
await cli(programArgs[0], programOptions)
