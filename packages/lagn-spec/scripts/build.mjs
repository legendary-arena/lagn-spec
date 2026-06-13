#!/usr/bin/env node

import { chmodSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Remove test files from dist
const distDir = './dist'
const files = readdirSync(distDir)
for (const file of files) {
  if (file.includes('.test.')) {
    try {
      unlinkSync(join(distDir, file))
    } catch (err) {
      // Ignore if file doesn't exist
    }
  }
}

// Make CLI executable
try {
  chmodSync('./dist/cli.js', 0o755)
} catch (err) {
  // On Windows, chmod might fail - that's OK
}
