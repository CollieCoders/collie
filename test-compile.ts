#!/usr/bin/env tsx
import { compile } from './packages/compiler/src/index.ts';
import fs from 'fs';

// Read example.collie
const source = fs.readFileSync('./example.collie', 'utf8');

// Compile
const result = compile(source, {
  componentNameHint: 'Example',
  jsxRuntime: 'automatic'
});

// Print any diagnostics
if (result.diagnostics.length > 0) {
  console.error('Diagnostics:');
  result.diagnostics.forEach(d => {
    console.error(`  ${d.severity}: ${d.message}`);
    if (d.span) {
      console.error(`    at line ${d.span.start.line}, column ${d.span.start.column}`);
    }
  });
  console.error('');
}

// Print the compiled code
console.log('Generated TSX:');
console.log('---');
console.log(result.code);
