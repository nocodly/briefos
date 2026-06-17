// Ambient declarations for Vite raw imports used in the bundled main process.
// Lets us inline schema.sql (and prompt .md files) as strings so they survive
// Rollup bundling instead of relying on a runtime __dirname file path.
declare module '*.sql?raw' {
  const content: string
  export default content
}

declare module '*.md?raw' {
  const content: string
  export default content
}
