import SwiftUI
import WebKit

/// A saved report, rendered by the bundled HTML renderer.
///
/// ── WHY THIS ONE SCREEN IS A WEB VIEW ───────────────────────────────────────
/// Decision 7 of the migration plan: ~950 lines of the report renderer stay
/// HTML. A Sentinel-7 report is a 40 kB markdown document in a dialect with its
/// own rules — tables written without a separator row, `⚑` and `◆` headings,
/// ASCII banner boxes, text progress bars — and the parsers that understand it
/// were bought one rule at a time. Re-implementing them in Swift to draw text
/// would be the largest possible rewrite of the least native-feeling screen in
/// the app.
///
/// So the parsers are BUNDLED, not ported: `scripts/gen-report-bundle.mjs`
/// compiles `fmtV2.ts` + `smartBlocks.ts` + micromark into one self-contained
/// HTML file inside the app. Nothing is fetched, ever.
///
/// ── AND WHY IT CANNOT NAVIGATE ──────────────────────────────────────────────
/// A report body is arbitrary text pasted from a model. It may contain a link.
/// A `WKWebView` that follows one would leave the bundled document and load a
/// remote page inside the app's own chrome, which is both a privacy leak and a
/// phishing surface. The delegate below allows exactly one navigation — the
/// initial `file://` load — and hands everything else to Safari, where the
/// address bar is visible.
struct ReportWebView: UIViewRepresentable {
    let markdown: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // No persistent storage: a report needs no cookies and no cache, and an
        // ephemeral store means nothing from one survives into the next.
        configuration.websiteDataStore = .nonPersistent()
        configuration.suppressesIncrementalRendering = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        // The page is a document inside a native screen; a pinch-zoom here
        // fights the scroll gesture that reads it.
        webView.scrollView.bouncesZoom = false
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false

        guard let url = Bundle.main.url(forResource: "ReportRenderer", withExtension: "html") else {
            // A build that shipped without the generated bundle. Saying so beats
            // a blank screen — the fix is `npm run report:bundle`.
            webView.loadHTMLString(
                "<body style=\"background:#000;color:#fff;font:16px -apple-system\">"
                + "<p>The report renderer is missing from this build.</p></body>",
                baseURL: nil
            )
            return webView
        }
        context.coordinator.allowed = url
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.markdown = markdown
        context.coordinator.renderIfReady(in: webView)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        var markdown: String = ""
        var allowed: URL?
        private var isLoaded = false

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            isLoaded = true
            renderIfReady(in: webView)
        }

        /// Hand the body to the page.
        ///
        /// JSON-encoded rather than interpolated: a report contains backticks,
        /// quotes, backslashes and newlines by construction, and building a JS
        /// string literal out of one by hand is how a document ends up executing
        /// itself.
        func renderIfReady(in webView: WKWebView) {
            guard isLoaded, !markdown.isEmpty else { return }
            guard let data = try? JSONEncoder().encode(markdown),
                  let literal = String(data: data, encoding: .utf8)
            else { return }
            webView.evaluateJavaScript("window.onyxRender(\(literal))")
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            let url = navigationAction.request.url
            if url == allowed || navigationAction.navigationType == .other, url?.isFileURL == true {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            // A link the reader actually tapped opens where a URL is visible.
            if navigationAction.navigationType == .linkActivated,
               let url, url.scheme == "https" {
                UIApplication.shared.open(url)
            }
        }
    }
}
