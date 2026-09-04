import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// Every lift you have actually trained, grouped by what it trains.
///
/// ── A SUB-SCREEN OF TRAINING, NOT A SIXTH TAB ───────────────────────────────
/// A library is somewhere you go FROM the training screen, not a peer of it.
/// The web app made the same call and wrote down the argument against a sixth
/// nav item; five tabs is also the point at which iOS stops giving you a tab and
/// starts giving you a "More" list.
///
/// ── THE SEARCH IS LOCAL, AND THAT IS NOT A SHORTCUT ─────────────────────────
/// The list is already in memory — thirty rows, read once from GRDB and kept
/// live by an observation. A query per keystroke would be slower than not having
/// a search at all, and would be the only screen in the app that can fail to
/// filter because the network did.
struct ExerciseLibraryView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied by the screenshot harness; the app reads its own store.
    var seeded: [ExerciseCatalogEntry]?

    @State private var entries: [ExerciseCatalogEntry] = []
    @State private var query = ""

    var body: some View {
        List {
            ForEach(groups, id: \.group) { section in
                Section {
                    ForEach(section.entries) { entry in
                        NavigationLink {
                            ExerciseDetailView(entry: entry)
                        } label: {
                            row(entry, in: section.group)
                        }
                    }
                } header: {
                    HelixSectionHeader(section.group.rawValue, section.group.domain)
                }
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .scrollContentBackground(.hidden)
        .helixScreen(.train)
        .tint(HelixDomain.train.accent)
        .navigationTitle("Exercises")
        .navigationBarTitleDisplayMode(.inline)
        // Stock `.searchable`: the system owns the field, its placement under
        // the title, the cancel button, the keyboard, Scribble, dictation and
        // the VoiceOver rotor entry. The web app hand-built all of that from a
        // bordered `<label>` and an `<input>`.
        .searchable(text: $query, prompt: "Search exercises")
        .autocorrectionDisabled()
        .overlay {
            if entries.isEmpty {
                ContentUnavailableView(
                    "Nothing logged yet",
                    systemImage: "dumbbell",
                    description: Text("Log a session and every lift in it shows up here.")
                )
            } else if groups.isEmpty {
                // The system's own no-results view, which VoiceOver announces
                // and which matches every other search on the device.
                ContentUnavailableView.search(text: query)
            }
        }
        .task {
            if let seeded {
                entries = seeded
                return
            }
            do {
                for try await rows in environment.database.exerciseCatalogStream() {
                    entries = rows
                }
            } catch {
                // An empty library is a bad screen; a crashed one is worse.
                entries = []
            }
        }
    }

    // MARK: - Rows

    private func row(_ entry: ExerciseCatalogEntry, in group: MuscleGroup) -> some View {
        HStack(spacing: 10) {
            // The rule carries the group's colour, so a scan down the list reads
            // as bands rather than as thirty identical rows.
            Capsule()
                .fill(group.domain.accent)
                .frame(width: 3)
                .frame(maxHeight: .infinity)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .foregroundStyle(Color.helix.textPrimary)
                Text(subtitle(entry))
                    .font(.caption)
                    .foregroundStyle(Color.helix.textSecondary)
            }
        }
        .padding(.vertical, 4)
        .frame(minHeight: 44)
        // One element, one announcement. Without this VoiceOver reads the name
        // and the subtitle as two separate stops inside a row that is one link.
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(entry.name), \(subtitle(entry))")
    }

    private func subtitle(_ entry: ExerciseCatalogEntry) -> String {
        let sets = entry.setCount == 1 ? "1 set" : "\(entry.setCount) sets"
        guard let last = entry.lastTrained else { return sets }
        return "\(sets) · last \(Self.shortDate(last))"
    }

    private static func shortDate(_ iso: String) -> String {
        guard let date = LogicalDay.date(fromISO: iso) else { return iso }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }

    // MARK: - Grouping

    private var filtered: [ExerciseCatalogEntry] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return entries }
        // Matched on the canonical name as well as the stored one, so searching
        // for the name you know finds the row that was renamed under you.
        return entries.filter {
            $0.name.lowercased().contains(needle)
                || ExerciseAliases.canonicalName($0.name).lowercased().contains(needle)
        }
    }

    /// Groups in a fixed order, each alphabetical, empty ones omitted.
    ///
    /// The ORDER is fixed rather than by size: a list whose headings move as you
    /// train is a list you cannot learn the shape of.
    private var groups: [(group: MuscleGroup, entries: [ExerciseCatalogEntry])] {
        let byGroup = Dictionary(grouping: filtered) { MuscleGroup.forExercise($0.name) }
        return MuscleGroup.allCases.compactMap { group in
            guard let rows = byGroup[group], !rows.isEmpty else { return nil }
            return (group, rows.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending })
        }
    }
}

#Preview("Library") {
    NavigationStack {
        ExerciseLibraryView(seeded: [
            .init(id: "1", name: "Barbell Bench Press", setCount: 48, lastTrained: "2026-09-01"),
            .init(id: "2", name: "Neutral-Grip Lat Pulldown", setCount: 36, lastTrained: "2026-08-31"),
            .init(id: "3", name: "Seated Cable Row (Wide Grip)", setCount: 22, lastTrained: "2026-08-28"),
            .init(id: "4", name: "Dumbbell Lateral Raise", setCount: 60, lastTrained: "2026-09-02"),
            .init(id: "5", name: "Hanging Knee Raise", setCount: 18, lastTrained: "2026-08-30"),
        ])
    }
    .environment(AppEnvironment.preview)
}
