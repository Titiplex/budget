const path = require('node:path')
const fs = require('node:fs')
const {FusesPlugin} = require('@electron-forge/plugin-fuses')
const {FuseV1Options, FuseVersion} = require('@electron/fuses')

const certFile = path.join(__dirname, 'cert.pfx')
const hasWindowsCert = fs.existsSync(certFile)

const hasMacNotarizeApi =
    Boolean(process.env.APPLE_API_KEY)
    && Boolean(process.env.APPLE_API_KEY_ID)
    && Boolean(process.env.APPLE_API_ISSUER)

module.exports = {
    packagerConfig: {
        asar: true,
        icon: path.join(__dirname, 'assets', 'icons', 'app'),
        executableName: 'Budget',
        ...(process.platform === 'darwin'
            ? {
                osxSign: {},
                ...(hasMacNotarizeApi
                    ? {
                        osxNotarize: {
                            appleApiKey: process.env.APPLE_API_KEY,
                            appleApiKeyId: process.env.APPLE_API_KEY_ID,
                            appleApiIssuer: process.env.APPLE_API_ISSUER,
                        },
                    }
                    : {}),
            }
            : {}),
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                ...(hasWindowsCert
                    ? {
                        certificateFile: certFile,
                        certificatePassword: process.env.WIN_CERT_PASSWORD,
                    }
                    : {}),
                setupIcon: path.join(__dirname, 'assets', 'icons', 'app.ico'),
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
        },
        {
            name: '@electron-forge/maker-deb',
            config: {
                options: {
                    bin: 'Budget',
                },
            },
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {
                options: {
                    bin: 'Budget',
                },
            },
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {
                    owner: 'Titiplex',
                    name: 'budget',
                },
                prerelease: false,
                draft: true,
            },
        },
    ],
}