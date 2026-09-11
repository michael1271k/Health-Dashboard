import UIKit
import WebKit

/// A saved report, rendered once into a PDF file on disk.
///
/// ── WHY THIS IS NOT THE ONE LINE IT LOOKS LIKE ──────────────────────────────
/// `WKWebView.pdf(configuration:)` is the whole job — after two waits that have
/// no natural signal. A web view that has finished its `file://` navigation has
/// loaded the RENDERER, not the report: the body is handed over afterwards
/// through `window.onyxRender(...)`, and the page still has to lay the document
/// out before there is anything to draw. Ask too early and the call does not
/// fail. It returns a blank or one-line PDF and reports success, and the first
/// person to find out is the reader who opens the file a week later. So this
/// waits for `didFinish` AND polls the laid-out height until it stops moving,
/// rather than sleeping for a number somebody guessed once on a fast phone.
///
/// ── AND WHY THE WEB VIEW LIVES IN A WINDOW ──────────────────────────────────
/// A detached `WKWebView` with a `.zero` frame is the same blank page from a
/// different cause: nothing lays out, so nothing prints. It gets a real
/// page-sized frame and is parked off the bottom of the key window, where it
/// lays out for real without ever being seen.
///
/// Navigation is locked to the bundled file for the same reason `ReportWebView`
/// locks it: a report body is arbitrary pasted text and may contain a link.
enum ReportPDF {
    /// A4, 595 × 842 pt. Letter (612 × 792) was the alternative and either
    /// prints; A4 wins because every other number in this app is metric, the
    /// report writes its dates `23 Aug – 29 Aug`, and A4 is the paper the sheet
    /// actually comes out on here.
    private static let pageSize = CGSize(width: 595, height: 842)

    /// Renders `markdown` and writes a PDF to a temporary file, returning its URL.
    @MainActor
    static func render(markdown: String, filename: String) async throws -> URL {
        guard let renderer = Bundle.main.url(forResource: "ReportRenderer", withExtension: "html") else {
            throw ReportPDFError.rendererMissing
        }

        let configuration = WKWebViewConfiguration()
        // Nothing from one render survives into the next, same as the reader.
        configuration.websiteDataStore = .nonPersistent()
        configuration.suppressesIncrementalRendering = true

        let webView = WKWebView(frame: CGRect(origin: .zero, size: pageSize), configuration: configuration)
        // `navigationDelegate` is weak: this local `let` is the only thing
        // keeping the delegate — and the continuation inside it — alive long
        // enough to be called back.
        let delegate = LoadDelegate(allowed: renderer)
        webView.navigationDelegate = delegate
        webView.isUserInteractionEnabled = false
        // The window's safe area is not the page's; without this the PDF carries
        // a band of home-indicator inset at the bottom of every page.
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        host(webView)
        defer {
            webView.navigationDelegate = nil
            webView.removeFromSuperview()
        }

        webView.loadFileURL(renderer, allowingReadAccessTo: renderer.deletingLastPathComponent())
        try await delegate.waitForLoad()

        // JSON-encoded, never interpolated — a report contains backticks,
        // quotes, backslashes and newlines by construction. The statement also
        // ENDS in a value: the async `evaluateJavaScript` bridges a bare JS
        // `undefined` badly, and `onyxRender` returns one.
        let encoded = try JSONEncoder().encode(markdown)
        let literal = String(decoding: encoded, as: UTF8.self)
        _ = try? await webView.evaluateJavaScript("window.onyxRender(\(literal)); document.body.scrollHeight")

        try await waitUntilSettled(webView)

        // A default `WKPDFConfiguration` carries a null rect, which means the
        // whole document — paginated at the web view's own size, which is why
        // the frame above is a page and not a guess.
        let pdf = try await webView.pdf(configuration: WKPDFConfiguration())

        let url = FileManager.default.temporaryDirectory.appending(path: safeFilename(filename))
        do {
            try pdf.write(to: url, options: .atomic)
        } catch {
            throw ReportPDFError.writeFailed(error.localizedDescription)
        }
        return url
    }

    /// Park it off the bottom of the key window: hosted views get a layout pass,
    /// detached ones do not. Harmless if there is no window — the render is then
    /// only as good as WebKit's off-screen layout, which is the fallback, not
    /// the plan.
    @MainActor
    private static func host(_ webView: WKWebView) {
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
            .first
        else { return }
        webView.frame.origin = CGPoint(x: 0, y: window.bounds.height)
        window.addSubview(webView)
        window.sendSubviewToBack(webView)
        webView.layoutIfNeeded()
    }

    /// "The markdown has been drawn" has no callback, so it is measured: poll the
    /// laid-out height until two readings agree and the page is taller than a
    /// stray line. A fixed sleep would be either too short (blank PDF, silently)
    /// or too long (every export waits for the worst case).
    @MainActor
    private static func waitUntilSettled(_ webView: WKWebView) async throws {
        var previous = 0.0
        for _ in 0..<80 {                                  // 80 × 50 ms = 4 s ceiling
            try await Task.sleep(for: .milliseconds(50))
            guard let raw = try? await webView.evaluateJavaScript("document.body.scrollHeight"),
                  let height = (raw as? NSNumber)?.doubleValue
            else { continue }
            // Stable AND non-zero, not "taller than 64 pt": a one-paragraph
            // week is a real report, and a floor tuned to catch a blank page
            // would have thrown `didNotSettle` on it after burning the ceiling.
            if height > 0, height == previous { return }
            previous = height
        }
        throw ReportPDFError.didNotSettle
    }

    /// `Onyx report — 23 Aug – 29 Aug 2026` is a title, not a path. Keep it
    /// readable — it is the name the reader sees in Files — but let nothing
    /// through that makes it a different file, or a hidden one.
    private static func safeFilename(_ raw: String) -> String {
        let banned = CharacterSet(charactersIn: "/:\\?%*|\"<>").union(.controlCharacters)
        let swapped = String(String.UnicodeScalarView(raw.unicodeScalars.map { banned.contains($0) ? "-" : $0 }))
        let trimmed = swapped.trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: ".")))
        // 80 characters, not 255: a week label is full of multi-byte dashes and
        // the limit downstream is bytes.
        let name = trimmed.isEmpty ? "Onyx report" : String(trimmed.prefix(80))
        return name + ".pdf"
    }

    @MainActor
    private final class LoadDelegate: NSObject, WKNavigationDelegate {
        private let allowed: URL
        private var continuation: CheckedContinuation<Void, Error>?
        private var outcome: Result<Void, Error>?

        init(allowed: URL) { self.allowed = allowed }

        /// A local file can finish loading before anyone awaits it, so the
        /// outcome is recorded and not merely signalled.
        ///
        /// ── AND IT HAS TO BE ABLE TO GIVE UP ────────────────────────────────
        /// Every other wait in this file is bounded. This one resumed only from
        /// a delegate callback, so a share sheet dismissed mid-navigation left
        /// the task cancelled, the continuation un-resumed, `render`'s `defer`
        /// never run — and the off-screen web view parked in the key window for
        /// the life of the process. `withTaskCancellationHandler` gives the
        /// cancel a way in, and the deadline covers a navigation that neither
        /// finishes nor fails.
        func waitForLoad() async throws {
            if let outcome { return try outcome.get() }
            let ceiling = loadCeilingSeconds
            let deadline = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(ceiling))
                guard !Task.isCancelled else { return }
                self?.finish(.failure(ReportPDFError.loadFailed("the page did not open in time")))
            }
            defer { deadline.cancel() }
            try await withTaskCancellationHandler {
                try await withCheckedThrowingContinuation { continuation in
                    // Cancellation can land between the check above and here.
                    if let outcome {
                        continuation.resume(with: outcome)
                        return
                    }
                    self.continuation = continuation
                }
            } onCancel: {
                Task { @MainActor [weak self] in self?.finish(.failure(CancellationError())) }
            }
        }

        /// A `file://` load is milliseconds; four seconds is a hang.
        private let loadCeilingSeconds = 4.0

        /// A failed navigation can still be followed by a `didFinish`; resume
        /// exactly once or the continuation traps.
        private func finish(_ result: Result<Void, Error>) {
            guard outcome == nil else { return }
            outcome = result
            continuation?.resume(with: result)
            continuation = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            finish(.success(()))
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            finish(.failure(ReportPDFError.loadFailed(error.localizedDescription)))
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            finish(.failure(ReportPDFError.loadFailed(error.localizedDescription)))
        }

        /// The bundled file and nothing else — and unlike the reader, nothing is
        /// handed to Safari either. Nobody tapped anything; a navigation here
        /// came from the document.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
        ) {
            // The same predicate `ReportWebView` arrived at, and for the reason
            // it records: WebKit does not always hand back a URL that compares
            // equal to the one `loadFileURL` was given, so a bare `==` cancels
            // the INITIAL navigation and the export fails on a report the
            // reader can open perfectly well. A `file://` URL from the bundle
            // is the only thing that gets through either way.
            let url = navigationAction.request.url
            let isTheDocument = url == allowed
                || (navigationAction.navigationType == .other && url?.isFileURL == true)
            decisionHandler(isTheDocument ? .allow : .cancel)
        }
    }
}

/// `LocalizedError` as well as `CustomStringConvertible`: a banner that reads
/// `error.localizedDescription` otherwise prints "The operation couldn't be
/// completed", which tells the reader nothing about a renderer that is missing.
enum ReportPDFError: Error, CustomStringConvertible, LocalizedError {
    case rendererMissing
    case loadFailed(String)
    case didNotSettle
    case writeFailed(String)

    var description: String {
        switch self {
        case .rendererMissing:
            "The report renderer is missing from this build, so there is nothing to print."
        case .loadFailed(let reason):
            "The report page could not be opened: \(reason)"
        case .didNotSettle:
            "The report did not finish drawing in time, so the PDF would have been blank."
        case .writeFailed(let reason):
            "The PDF could not be saved: \(reason)"
        }
    }

    var errorDescription: String? { description }
}
