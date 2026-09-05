// swift-tools-version: 6.0
import Foundation
import PackageDescription

/// `ONYX_ADP=1 swift build` compiles the Gate 0 code — HealthKit background
/// delivery (`HealthObservers`) — that a personal team cannot sign. Off by
/// default so the package builds and tests everywhere; the flag, not the code,
/// is what waits on the Developer Program.
let adp: [SwiftSetting] = ProcessInfo.processInfo.environment["ONYX_ADP"] == nil ? [] : [.define("ONYX_ADP")]

/// OnyxData — the local store, the sync outbox, and the Supabase session.
///
/// ── WHY THIS IS A PACKAGE TOO ────────────────────────────────────────────────
/// Same reason as `OnyxCore`: everything in here compiles and tests for macOS
/// from the command line. On a free Apple team the app target expires every
/// seven days and needs Xcode, a device and a re-sign to run at all — so the
/// more of the app that lives in a package, the more of it stays continuously
/// verifiable. What is left in the Xcode target should be views and the app
/// entry point, and as little else as can be managed.
///
/// It depends on `OnyxCore` and never the other way round. The domain does not
/// know that a database exists.
let package = Package(
    name: "OnyxData",
    platforms: [
        .iOS(.v18),
        .macOS(.v14),
    ],
    products: [
        .library(name: "OnyxData", targets: ["OnyxData"]),
    ],
    dependencies: [
        .package(path: "../OnyxCore"),
        // The local source of truth. Reads never touch the network.
        .package(url: "https://github.com/groue/GRDB.swift", from: "7.11.1"),
        // Auth (with rotating refresh tokens) and PostgREST. Hand-rolling token
        // refresh is the kind of thing that works until the day it does not.
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.55.1"),
    ],
    targets: [
        .target(
            name: "OnyxData",
            dependencies: [
                "OnyxCore",
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "Supabase", package: "supabase-swift"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)] + adp
        ),
        .testTarget(
            name: "OnyxDataTests",
            dependencies: ["OnyxData"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
