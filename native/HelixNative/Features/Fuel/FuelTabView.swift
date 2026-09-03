import SwiftUI

/// The Fuel tab root. Filled in by Wave 4, Task 2.
struct FuelTabView: View {
    var body: some View {
        ContentUnavailableView {
            Label("Fuel", systemImage: "hammer")
        } description: {
            Text("Arrives with Wave 4. The web app is still the place for this.")
        }
        .navigationTitle("Fuel")
    }
}
