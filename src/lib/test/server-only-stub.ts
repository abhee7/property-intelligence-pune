// Test stand-in for the `server-only` package.
//
// In the app, `import "server-only"` makes the build fail if client code pulls in a server
// module. Under Vitest there is no client/server split, so the real package would just throw.
// vitest.config.ts aliases `server-only` to this empty module.
export {};
