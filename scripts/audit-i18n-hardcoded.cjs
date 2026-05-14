const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const srcDir = path.join(root, 'src')
const ignoredFiles = new Set([
  path.join('src', 'locales', 'en.ts'),
  path.join('src', 'locales', 'fr.ts'),
  path.join('src', 'locales', 'tax.en.ts'),
  path.join('src', 'locales', 'tax.fr.ts'),
  path.join('src', 'locales', 'ui.en.ts'),
  path.join('src', 'locales', 'ui.fr.ts'),
])

function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return ['node_modules', 'dist', 'styles'].includes(entry.name) ? [] : walk(fullPath)
    if (!entry.isFile() || !entry.name.endsWith('.vue')) return []
    const relative = path.relative(root, fullPath)
    return ignoredFiles.has(relative) || relative.includes(`${path.sep}test${path.sep}`) ? [] : [fullPath]
  })
}

function lineOf(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function looksUserFacing(value) {
  const text = value.replace(/{{[\s\S]*?}}/g, '').replace(/\s+/g, ' ').trim()
  if (!/[A-Za-zÀ-ÿ]/.test(text)) return false
  if (/^[A-Z0-9_:\-\s]+$/.test(text)) return false
  if (/^[a-z0-9-]+$/.test(text)) return false
  if (/^[-–—•·.,:;!?()/%+0-9\s]+$/.test(text)) return false
  return text
}

function templateOf(content) {
  const match = content.match(/<template[\s\S]*?<\/template>/)
  return match && match.index != null ? {text: match[0], offset: match.index} : null
}

function scanTemplate(file, content) {
  const template = templateOf(content)
  if (!template) return []

  const findings = []
  let inTag = false
  let start = 0
  let buffer = ''

  function flush() {
    const text = looksUserFacing(buffer)
    if (text) findings.push({file, line: lineOf(content, template.offset + start), value: text, kind: 'template text'})
    buffer = ''
  }

  for (let index = 0; index < template.text.length; index += 1) {
    const char = template.text[index]
    if (char === '<') {
      if (!inTag) flush()
      inTag = true
    } else if (char === '>') {
      inTag = false
      start = index + 1
    } else if (!inTag) {
      buffer += char
    }
  }
  flush()

  for (const match of template.text.matchAll(/\s(aria-label|placeholder|title|alt)="([^"]+)"/g)) {
    const text = looksUserFacing(match[2])
    if (text && !match[2].includes('t(')) {
      findings.push({file, line: lineOf(content, template.offset + match.index), value: `${match[1]}="${text}"`, kind: 'template attribute'})
    }
  }

  return findings
}

const findings = walk(srcDir).flatMap((file) => scanTemplate(path.relative(root, file), fs.readFileSync(file, 'utf8')))

if (findings.length) {
  console.error(`Found ${findings.length} potential hardcoded user-facing string(s):`)
  for (const finding of findings.slice(0, 200)) console.error(`- ${finding.file}:${finding.line} [${finding.kind}] ${finding.value}`)
  if (findings.length > 200) console.error(`...and ${findings.length - 200} more.`)
  process.exit(1)
}

console.log('No obvious hardcoded user-facing strings found outside locale files.')
