#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { validate, summarize } from './validator.js'

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2 || args[0] !== 'validate') {
    console.error('Usage: lagn validate <file.lagn.json>')
    process.exit(1)
  }

  const filePath = args[1]

  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`File not found: ${filePath}`)
      process.exit(2)
    }
    console.error(`Cannot read file: ${filePath}`)
    process.exit(2)
  }

  let json: unknown
  try {
    json = JSON.parse(content)
  } catch (err) {
    console.error(`✗ Invalid LAGN file:`)
    console.error(`  ${(err as Error).message}`)
    process.exit(1)
  }

  const result = validate(json)
  const summary = summarize(json)

  if (!result.valid) {
    console.error(`✗ Invalid LAGN file:`)
    if (result.errors) {
      for (const error of result.errors) {
        console.error(`  ${error}`)
      }
    }
    process.exit(1)
  }

  console.log(
    `✓ Valid LAGN file: game_id=${summary.game_id}, variant=${summary.variant}, players=${summary.player_count}, outcome=${summary.result}`
  )
  process.exit(0)
}

main()
