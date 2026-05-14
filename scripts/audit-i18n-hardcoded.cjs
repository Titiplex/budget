const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const srcDir = path.join(root, 'src')

const ignoredDirs = new Set(['node_modules', 'dist', 'styles'])
const ignoredFiles = new Set([
  path.join('src', 'locales', 'en.ts'),
  path.join('src', 'locales', 'fr.ts'),
  path.join('src', 'locales', 'tax.en.ts'),
  path.join('src', 'locales', 'tax.fr.ts'),
  path.join('src', 'locales', 'ui.en.ts'),
  path.join('src', 'locales', 'ui.fr.ts'),
])

const allowedLiteralPatterns = [
  /^[-–—•·.,:;!?()/%+0-9\s]+$/,
  /^[A-Z0-9_:-]+$/,
  /^#[0-9a-fA-F]{3,8}$/,
  /^rgb\(/,
  /^hsl\(/,
  /^https?:\/\//,
  /^window\./,
  /^db:/,
  /^app:/,
  /^file:/,
  /^secret:/,
  /^backup:/,
  /^integrity:/,
  /^recovery:/,
  /^audit:/,
  /^import:/,
  /^marketData:/,
  /^aria-/,
  /^data-/,
  /^[a-z0-9-]+$/,
]

const attributeAllowList = new Set([
  'class',
  ':class',
  'id',
  ':id',
  'type',
  'role',
  'viewBox',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'x1',
  'x2',
  'y1',
  'y2',
  'x',
  'y',
  'font-size',
  'd',
  'cx',
  'cy',
  'r',
  'min',
  'max',
  'step',
  'rows',
  'maxlength',
])

function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) return []
      return walk(path.join(dir, entry.name))
    }

    if (!entry.isFile()) return []
    const fullPath = path.join(dir, entry.name)
    if (!/\.(vue|ts|js)$/.test(entry.name)) return []
    const relative = path.relative(root, fullPath)
    if (ignoredFiles.has(relative)) return []
    if (relative.includes(`${path.sep}test${path.sep}`)) return []
    return [fullPath]
  })
}

function lineOf(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function isAllowedLiteral(value) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return true
  return allowedLiteralPatterns.some((pattern) => pattern.test(normalized))
}

function findTemplateLiterals(file, content) {
  const findings = []
  const templateMatch = content.match(/<template[\s\S]*?<\/template>/)
  if (!templateMatch || templateMatch.index == null) return findings

  const template = templateMatch[0]
  const offset = templateMatch.index

  const textRegex = />\s*([^<{][^<{]*[A-Za-zÀ-ÿ][^<{]*)\s*</g
  for (const match of template.matchAll(textRegex)) {
    const value = match[1].replace(/\s+/g, ' ').trim()
    if (!isAllowedLiteral(value) && !value.includes('{{')) {
      findings.push({file, line: lineOf(content, offset + match.index + 1), value, kind: 'template text'})
    }
  }

  const attrRegex = /\s([:@]?[A-Za-z0-9_-]+)=['"]([^'"]*[A-Za-zÀ-ÿ][^'"]*)['"]/g
  for (const match of template.matchAll(attrRegex)) {
    const [, attribute, value] = match
    if (attributeAllowList.has(attribute)) continue
    if (value.includes('t(') || value.includes('{{') || isAllowedLiteral(value)) continue
    findings.push({file, line: lineOf(content, offset + match.index + 1), value: `${attribute}="${value}"`, kind: 'template attribute'})
  }

  return findings
}

function findScriptUserStrings(file, content) {
  const findings = []
  const scriptMatch = content.match(/<script[\s\S]*?<\/script>/)
  if (!scriptMatch || scriptMatch.index == null) return findings

  const script = scriptMatch[0]
  const offset = scriptMatch.index
  const stringRegex = /(?<![\w$])(['"`])((?:\\.|(?!\1)[\s\S])*?[A-Za-zÀ-ÿ][\s\S]*?)\1/g

  for (const match of script.matchAll(stringRegex)) {
    const value = match[2].replace(/\s+/g, ' ').trim()
    const prefix = script.slice(Math.max(0, match.index - 40), match.index)
    if (prefix.includes('t(') || prefix.includes('import ') || prefix.includes('from ') || prefix.includes('type ')) continue
    if (isAllowedLiteral(value)) continue
    findings.push({file, line: lineOf(content, offset + match.index), value, kind: 'script string'})
  }

  return findings
}

const findings = walk(srcDir).flatMap((file) => {
  const content = fs.readFileSync(file, 'utf8')
  return [
    ...findTemplateLiterals(path.relative(root, file), content),
    ...findScriptUserStrings(path.relative(root, file), content),
  ]
})

if (findings.length) {
  console.error(`Found ${findings.length} potential hardcoded user-facing string(s):`)
  for (const finding of findings.slice(0, 200)) {
    console.error(`- ${finding.file}:${finding.line} [${finding.kind}] ${finding.value}`)
  }
  if (findings.length > 200) {
    console.error(`...and ${findings.length - 200} more.`)
  }
  process.exit(1)
}

console.log('No obvious hardcoded user-facing strings found outside locale files.')
