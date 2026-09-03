import Foundation
import GRDB

public extension AppDatabase {

    /// Saved reports, newest week first.
    ///
    /// ── ONLY THE ONES WITH A BODY ───────────────────────────────────────────
    /// `content_md` is nullable and nine of the fifteen rows are Notion-era
    /// stubs — a type, a date range and nothing to read. A list that offers them
    /// is a list where a third of the taps open an empty screen.
    ///
    /// No type filter: the FMT v2 test is a regex on the BODY, not a column, so
    /// a `weekly` row whose text says "FMT v2" is a v2 report and renders as
    /// one. Filtering on `type = 'sentinel7'` here would hide it.
    func reportsStream() -> AsyncThrowingStream<[ReportRow], any Error> {
        stream(ValueObservation.tracking { db in
            try ReportRow
                .filter(sql: "content_md IS NOT NULL AND trim(content_md) <> ''")
                .order(Column("period_start").desc, Column("created_at").desc)
                .fetchAll(db)
        })
    }

    /// One report's body, read at open time rather than carried in the list.
    ///
    /// The bodies run 16 kB to 40 kB and grow every week; holding twenty of them
    /// in a list model to show twenty date rows is a megabyte of strings the
    /// screen never draws.
    func reportBody(id: String) throws -> String? {
        try writer.read { db in
            try String.fetchOne(
                db, sql: "SELECT content_md FROM reports WHERE id = ?", arguments: [id]
            )
        }
    }
}
