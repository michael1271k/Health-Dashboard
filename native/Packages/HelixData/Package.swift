// swift-tools-version: 6.0
import PackageDescription

/// HelixData — the local store, the sync outbox, and the Supabase session.
///
/// ── WHY THIS IS A PACKAGE TOO ────────────────────────────────────────────────
/// Same reason as `HelixCore`: everything in here compiles and tests for macOS
/// from the command line. On a free Apple team the app target expires every
/// seven days and needs Xcode, a device and a re-sign to run at all — so the
/// more of the app that lives in a package, the more of it stays continuously
/// verifiable. What is left in the Xcode target should be views and the app
/// entry point, and as little else as can be managed.
///
/// It depends on `HelixCore` and never the other way round. The domain does not
/// know that a database exists.
let package = Package(
    name: "HelixData",
    platforms: [
        .iOS(.v18),
        .macOS(.v14),
    ],
    products: [
        .library(name: "HelixData", targets: ["HelixData"]),
    ],
    dependencies: [
        .package(path: "../HelixCore"),
        // The local source of truth. Reads never touch the network.
        .package(url: "https://github.com/groue/GRDB.swift", from: "7.11.1"),
        // Auth (with rotating refresh tokens) and PostgREST. Hand-rolling token
        // refresh is the kind of thing that works until the day it does not.
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.55.1"),
    ],
    targets: [
        .target(
            name: "HelixData",
            dependencies: [
                "HelixCore",
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "Supabase", package: "supabase-swift"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "HelixDataTests",
            dependencies: ["HelixData"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
