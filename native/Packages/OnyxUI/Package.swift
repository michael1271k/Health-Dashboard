// swift-tools-version: 6.0
import PackageDescription

// The design system and the tile views — everything that DRAWS and belongs to
// more than one target. The app composes the Today grid from these tiles
// (Wave 6); the widget extension puts the same tiles on the Home Screen
// (Wave 5). One drawing, two hosts; a face that exists twice drifts the first
// time either copy is nudged.
//
// Depends on OnyxCore only: `OnyxSnapshot` is the tiles' input and lives
// there. Never on OnyxData — a view that can reach the database is a view
// that will, and the extension's read path has to stay the provider's alone.
let package = Package(
    name: "OnyxUI",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "OnyxUI", targets: ["OnyxUI"]),
    ],
    dependencies: [
        .package(path: "../OnyxCore"),
    ],
    targets: [
        .target(
            name: "OnyxUI",
            dependencies: [.product(name: "OnyxCore", package: "OnyxCore")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(name: "OnyxUITests", dependencies: ["OnyxUI"], swiftSettings: [.swiftLanguageMode(.v6)]),
    ]
)
