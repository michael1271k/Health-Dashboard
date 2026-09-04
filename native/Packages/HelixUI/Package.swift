// swift-tools-version: 6.0
import PackageDescription

// The design system and the tile views — everything that DRAWS and belongs to
// more than one target. The app composes the Today grid from these tiles
// (Wave 6); the widget extension puts the same tiles on the Home Screen
// (Wave 5). One drawing, two hosts; a face that exists twice drifts the first
// time either copy is nudged.
//
// Depends on HelixCore only: `HelixSnapshot` is the tiles' input and lives
// there. Never on HelixData — a view that can reach the database is a view
// that will, and the extension's read path has to stay the provider's alone.
let package = Package(
    name: "HelixUI",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "HelixUI", targets: ["HelixUI"]),
    ],
    dependencies: [
        .package(path: "../HelixCore"),
    ],
    targets: [
        .target(
            name: "HelixUI",
            dependencies: [.product(name: "HelixCore", package: "HelixCore")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(name: "HelixUITests", dependencies: ["HelixUI"], swiftSettings: [.swiftLanguageMode(.v6)]),
    ]
)
