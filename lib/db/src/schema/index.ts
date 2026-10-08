// Drizzle schema for this project.
//
// There are currently no tables. The Park Pulse app ships its park, tree,
// facility and dog-park data as static GeoJSON/JSON in
// `artifacts/park-pulse/public/data`, so nothing has needed a database yet.
//
// To add the first table:
//   1. define it with pgTable in its own file and re-export it here
//   2. add `createInsertSchema(table)` + `z.infer` to get a validated insert type
//   3. generate migrations with `pnpm --filter @workspace/db run push`
//
// `scripts/post-merge.sh` detects the empty state and skips the push, so
// leaving this file as-is is safe.
export {};