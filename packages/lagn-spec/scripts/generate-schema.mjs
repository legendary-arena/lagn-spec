#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'node:fs'
import { generateSchema } from '../dist/validator.js'

mkdirSync('schemas', { recursive: true })
const schema = generateSchema()
writeFileSync('schemas/lagn-v1.json', JSON.stringify(schema, null, 2))
console.log('Generated schemas/lagn-v1.json')
