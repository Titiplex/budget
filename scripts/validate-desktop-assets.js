const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

const requiredAssets = [
    {
        path: path.join('assets', 'icons', 'app.png'),
        signature: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        label: 'PNG runtime window icon',
    },
    {
        path: path.join('assets', 'icons', 'app.ico'),
        signature: Buffer.from([0x00, 0x00, 0x01, 0x00]),
        label: 'Windows installer icon',
    },
    {
        path: path.join('assets', 'icons', 'app.icns'),
        signature: Buffer.from('icns'),
        label: 'macOS app icon',
    },
]

function assertAsset(asset) {
    const absolutePath = path.join(repoRoot, asset.path)

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`${asset.label} is missing at ${asset.path}.`)
    }

    const buffer = fs.readFileSync(absolutePath)
    if (buffer.length === 0) {
        throw new Error(`${asset.label} is empty at ${asset.path}.`)
    }

    const actualSignature = buffer.subarray(0, asset.signature.length)
    if (!actualSignature.equals(asset.signature)) {
        throw new Error(`${asset.label} has an unexpected file signature at ${asset.path}.`)
    }
}

for (const asset of requiredAssets) {
    assertAsset(asset)
}

console.log('Desktop assets look valid.')
