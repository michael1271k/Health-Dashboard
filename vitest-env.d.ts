/// <reference types="vitest/globals" />

// `vitest.config.ts` sets `globals: true`, so `describe`/`it`/`expect` are
// ambient in every test file. Nothing ever told TypeScript that.
//
// It typechecked anyway, for a reason worth writing down: the devDependency
// `@types/testing-library__jest-dom` — a deprecated DefinitelyTyped stub that
// exists only to say "use the real package's own types" — transitively pulled
// `@types/jest`, and JEST's ambient globals were what satisfied every
// `expect(...)` in the suite. Remove the stub as the dead dependency it appears
// to be and 73 test files stop compiling, which is a confusing way to find out.
//
// So the globals now come from vitest, which is the runner actually executing
// them. Declared here as a reference rather than a tsconfig `types` array,
// because that array is exclusive: adding it would silently drop the automatic
// @types/node and @types/react resolution the rest of the build depends on.
