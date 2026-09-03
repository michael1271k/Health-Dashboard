import Foundation
import GRDB

/// A Postgres `jsonb` (or `text[]`) column, carried as canonical JSON text.
///
/// ── WHY NOT `[String: Any]`, AND WHY NOT A TYPED STRUCT ─────────────────────
/// PostgREST sends a `jsonb` column as a real JSON value, so a Swift property
/// typed `String` fails to decode outright. SQLite has no JSON type, so it has
/// to land as text. Something has to bridge the two.
///
/// A typed struct per column would be better where the shape is known — and for
/// `dashboard_layouts.layout` it eventually will be, when Wave 6 ports the slot
/// algebra. But there are seven such columns across the mirror and the mirror's
/// job is to hold what the server said, not to understand it. A blob that
/// round-trips exactly is the honest answer for a cache; the screen that needs
/// the shape decodes it, and gets a compile error when the shape changes rather
/// than a mirror that quietly stopped syncing a column.
///
/// `sortedKeys` on the way in, so the same server value always produces the same
/// bytes — which is what lets a row be compared for equality without decoding.
public struct JSONText: Codable, Sendable, Equatable, DatabaseValueConvertible {

    public let raw: String

    public init(raw: String) { self.raw = raw }

    // MARK: Codable

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        // A column that is ALREADY text (this row came out of SQLite, not off
        // the wire) decodes straight through. Without this the round trip
        // through GRDB would fail on its own output.
        if let text = try? container.decode(String.self) {
            self.raw = text
            return
        }
        let value = try container.decode(JSONValue.self)
        self.raw = value.canonicalText
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        // Encoded back as a real JSON value, not as a string: this type goes out
        // to PostgREST as well as into SQLite, and a `jsonb` column will not
        // accept a quoted blob.
        if let value = try? JSONDecoder().decode(JSONValue.self, from: Data(raw.utf8)) {
            try container.encode(value)
        } else {
            try container.encode(raw)
        }
    }

    // MARK: DatabaseValueConvertible

    public var databaseValue: DatabaseValue { raw.databaseValue }

    public static func fromDatabaseValue(_ dbValue: DatabaseValue) -> JSONText? {
        String.fromDatabaseValue(dbValue).map(JSONText.init(raw:))
    }
}

/// The smallest thing that can hold arbitrary JSON.
///
/// Private, and it stays private: it exists to get bytes across the boundary,
/// not to be a JSON library. Anything that wants to *read* the contents should
/// decode `JSONText.raw` into a type that names the fields it needs.
private enum JSONValue: Codable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "not JSON")
        }
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    var canonicalText: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(self), let text = String(data: data, encoding: .utf8) else {
            return "null"
        }
        return text
    }
}
