// Intentionally empty.
//
// Registration moved into Swift: HelixAuthPlugin now conforms to
// CAPBridgedPlugin directly (see HelixAuth.swift) and is registered
// explicitly in HelixViewController.capacitorDidLoad(). Re-adding the
// CAP_PLUGIN(...) macro here would double-declare identifier/jsName/
// pluginMethods on the class. Kept as a file (rather than deleted) so the
// existing Xcode target membership stays valid without a project edit.
