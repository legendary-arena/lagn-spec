import { readFileSync } from 'node:fs';

const path = process.argv[2];
const text = readFileSync(path, 'utf8');

const dups = [];
const stack = [];
const pathStack = [];
let i = 0;
let line = 1;
let pendingKeyForChild = null;

function readString() {
  let s = '';
  i++; // skip opening "
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      s += ch + text[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') {
      i++;
      return s;
    }
    if (ch === '\n') line++;
    s += ch;
    i++;
  }
  throw new Error('Unterminated string');
}

while (i < text.length) {
  const ch = text[i];
  if (ch === '\n') { line++; i++; continue; }
  if (ch === '{') {
    stack.push({ keys: new Map() });
    if (pendingKeyForChild !== null) {
      pathStack.push(pendingKeyForChild);
      pendingKeyForChild = null;
    } else {
      pathStack.push('<root>');
    }
    i++; continue;
  }
  if (ch === '}') {
    stack.pop();
    pathStack.pop();
    i++; continue;
  }
  if (ch === '"') {
    const startLine = line;
    const s = readString();
    let j = i;
    while (j < text.length && /[ \t\r\n]/.test(text[j])) j++;
    if (text[j] === ':') {
      const top = stack[stack.length - 1];
      if (top.keys.has(s)) {
        dups.push({
          path: pathStack.join(' > '),
          key: s,
          line: startLine,
          firstLine: top.keys.get(s),
        });
      } else {
        top.keys.set(s, startLine);
      }
      pendingKeyForChild = s;
    }
    continue;
  }
  i++;
}

if (dups.length === 0) {
  console.log('No duplicate keys found.');
} else {
  console.log(`Found ${dups.length} duplicate key(s):`);
  for (const d of dups) {
    console.log(`  line ${d.line} (first at ${d.firstLine}): ${d.path} > "${d.key}"`);
  }
}
