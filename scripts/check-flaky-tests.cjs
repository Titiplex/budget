#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const scanRoots = [
    path.join(repoRoot, 'src', 'test'),
    path.join(repoRoot, 'electron'),
]

const TEST_FILE_RE = /\.(test|spec)\.(cjs|mjs|js|ts|tsx)$|src[\\/]test[\\/]e2e[\\/].+\.(cjs|mjs|js)$/
const ONLY_RE = /\b(?:it|test|describe)\.only(?:\.each)?\s*\(/
const SKIP_RE = /\b(?:it|test|describe)\.skip(?:\.each)?\s*\(/
const FLAKY_RE = /@flaky\s*\(([^)]*)\)/
const ISSUE_RE = /issue\s*:\s*(https:\/\/github\.com\/Titiplex\/budget\/issues\/\d+)/
const EXPIRES_RE = /expires\s*:\s*(\d{4}-\d{2}-\d{2})/
const REASON_RE = /reason\s*:\s*("[^"]+"|'[^']+'|[^,)]+)/

function walk(dir, result = []) {
    if (!fs.existsSync(dir)) return result

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue

        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walk(fullPath, result)
        } else if (TEST_FILE_RE.test(fullPath)) {
            result.push(fullPath)
        }
    }

    return result
}

function isExpired(dateOnly) {
    const expiry = new Date(`${dateOnly}T23:59:59.999Z`)
    if (Number.isNaN(expiry.getTime())) return true
    return expiry.getTime() < Date.now()
}

function validateFlakyMarker(markerText) {
    const issue = markerText.match(ISSUE_RE)?.[1] || null
    const expires = markerText.match(EXPIRES_RE)?.[1] || null
    const reason = markerText.match(REASON_RE)?.[1] || null
    const errors = []

    if (!issue) errors.push('missing issue URL')
    if (!expires) errors.push('missing expires YYYY-MM-DD')
    if (expires && isExpired(expires)) errors.push(`expired on ${expires}`)
    if (!reason || !reason.replace(/^['"]|['"]$/g, '').trim()) errors.push('missing reason')

    return errors
}

function inspectFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split(/\r?\n/)
    const violations = []

    lines.forEach((line, index) => {
        const lineNumber = index + 1

        if (ONLY_RE.test(line)) {
            violations.push({
                filePath,
                lineNumber,
                message: 'Focused test committed with .only',
            })
        }

        if (!SKIP_RE.test(line)) return

        const context = lines.slice(Math.max(0, index - 6), index + 1).join('\n')
        const marker = context.match(FLAKY_RE)

        if (!marker) {
            violations.push({
                filePath,
                lineNumber,
                message: 'Skipped test without @flaky(issue, expires, reason) marker',
            })
            return
        }

        const markerErrors = validateFlakyMarker(marker[1])
        for (const markerError of markerErrors) {
            violations.push({
                filePath,
                lineNumber,
                message: `Invalid @flaky marker: ${markerError}`,
            })
        }
    })

    return violations
}

const files = scanRoots.flatMap((root) => walk(root))
const violations = files.flatMap(inspectFile)

if (violations.length) {
    console.error('Flaky test audit failed:\n')
    for (const violation of violations) {
        const relativePath = path.relative(repoRoot, violation.filePath)
        console.error(`- ${relativePath}:${violation.lineNumber} ${violation.message}`)
    }
    console.error('\nAdd a tracked @flaky marker with an issue and expiration, or remove the skip/only.')
    process.exit(1)
}

console.log(`Flaky test audit passed (${files.length} test files scanned).`)
