export type CsvRecord = Record<string, string>

export function normalizeHeader(value: string) {
    return value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '')
}

function splitCsv(content: string) {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false

    for (let i = 0; i < content.length; i += 1) {
        const char = content[i]
        const next = content[i + 1]

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"'
                i += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }

        if (char === ',' && !inQuotes) {
            row.push(cell)
            cell = ''
            continue
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') {
                i += 1
            }
            row.push(cell)
            rows.push(row)
            row = []
            cell = ''
            continue
        }

        cell += char
    }

    row.push(cell)
    rows.push(row)

    return rows.filter((currentRow) => currentRow.some((value) => value.trim().length > 0))
}

export function parseCsv(content: string): CsvRecord[] {
    const rows = splitCsv(content)
    if (!rows.length) return []

    const headers = rows[0].map((header) => normalizeHeader(header))
    if (!headers.length) return []

    return rows
        .slice(1)
        .map((row) => {
            const record: CsvRecord = {}
            headers.forEach((header, index) => {
                record[header] = (row[index] ?? '').trim()
            })
            return record
        })
        .filter((record) => Object.values(record).some((value) => value.length > 0))
}

function escapeCsvValue(value: unknown) {
    const stringValue = String(value ?? '')
    if (/[",\n\r]/.test(stringValue) || /^\s|\s$/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`
    }
    return stringValue
}

export function toCsv(rows: Array<Record<string, unknown>>, headers: string[]) {
    const lines = [
        headers.map((header) => escapeCsvValue(header)).join(','),
        ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? '')).join(',')),
    ]

    return `${lines.join('\n')}\n`
}

export function readCsvValue(row: CsvRecord, aliases: string[]) {
    for (const alias of aliases) {
        const key = normalizeHeader(alias)
        if (key in row && row[key].trim().length) {
            return row[key].trim()
        }
    }
    return ''
}