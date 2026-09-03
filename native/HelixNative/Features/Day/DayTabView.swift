import SwiftUI

/// The Body tab root — `/day/[date]`. Filled in by Wave 4, Task 1.
struct DayTabView: View {
    var body: some View {
        ContentUnavailableView {
            Label("Day", systemImage: "hammer")
        } description: {
            Text("Arrives with Wave 4. The web app is still the place for this.")
        }
        .navigationTitle("Body")
    }
}
