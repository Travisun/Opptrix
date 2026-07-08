#!/usr/bin/env node
import { ResearchHub } from '@opptrix/research-hub'
import { createDefaultAppContext } from '../app-context.js'
import { DATA_LAYER_MINING_TOOL_NAMES } from '../tool-meta.js'
import { ToolRegistry } from '../tools.js'
import { runMcpStdio } from './server.js'

const hub = new ResearchHub()
const registry = new ToolRegistry(hub, createDefaultAppContext())

const miningOnly = process.argv.includes('--mining')

void runMcpStdio(registry, {
  toolNames: miningOnly ? DATA_LAYER_MINING_TOOL_NAMES : registry.chatToolNames(),
}).catch(err => {
  console.error(err)
  process.exit(1)
})
