import type {CapacitorConfig} from '@capacitor/cli'

const config: CapacitorConfig = {
    appId: 'com.titiplex.budget',
    appName: 'Budget',
    webDir: 'dist/renderer',
    server: {
        androidScheme: 'https',
    },
    plugins: {
        CapacitorSQLite: {
            iosDatabaseLocation: 'Library/CapacitorDatabase',
            iosIsEncryption: false,
            iosKeychainPrefix: 'budget',
            androidIsEncryption: false,
        },
    },
}

export default config
