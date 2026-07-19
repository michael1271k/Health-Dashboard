import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor config for the native iOS shell. The shell loads the live web
 * deploy (so web content updates over-the-air without an App Store release)
 * and adds native HealthKit + haptics on top. Run `npx cap add ios` after
 * install to generate the Xcode project. See docs/native-ios.md.
 */
const config: CapacitorConfig = {
  appId: 'app.helix.health.michael',
  appName: 'HELIX',
  webDir: 'public', // only used for a bundled fallback; primary content is server.url
  server: {
    url: 'https://helix-health-fitness.netlify.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#030509',
  },
}

export default config
