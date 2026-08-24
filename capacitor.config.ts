import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor config for the native iOS shell. The shell loads the live web
 * deploy (so web content updates over-the-air without an App Store release)
 * and adds native HealthKit + haptics on top. Run `npx cap add ios` after
 * install to generate the Xcode project. See docs/native-ios.md.
 */
const config: CapacitorConfig = {
  appId: 'app.helix.health.michael',
  appName: 'Helix',
  webDir: 'public', // only used for a bundled fallback; primary content is server.url
  server: {
    url: 'https://helix-health-fitness.netlify.app',
    cleartext: false,
    /**
     * THE BLACK SCREEN'S LAST LINE OF DEFENCE.
     *
     * iOS jetsams a backgrounded WKWebView's content process; Capacitor answers
     * that by reloading `url` (WebViewDelegationHandler). When that reload
     * cannot reach the network its ONLY fallback is this path — and with no
     * errorPath set, a failed provisional navigation painted nothing at all
     * over `ios.backgroundColor`, which is how a locked phone came back to a
     * frozen black screen.
     *
     * Served from the bundle (`webDir`), so it renders with no network, no
     * chunks and no service worker. `npx cap sync ios` copies it.
     */
    errorPath: 'offline.html',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0A0B0D',
  },
}

export default config
