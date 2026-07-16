// Offline generator for convex/_generated used as a build fallback when a
// Convex deploy key isn't available (so `next build` still succeeds and the
// frontend deploys against NEXT_PUBLIC_CONVEX_URL). When CONVEX_DEPLOY_KEY IS
// present the Vercel build runs `npx convex deploy` instead, which regenerates
// these files with fully-typed api — so this is a strict, deploy-compatible
// approximation (ApiFromModules over the local function files, pure local type
// inference, no deployment needed).
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

// If a real (deploy-generated) _generated already exists, don't clobber it.
if (existsSync("convex/_generated/api.d.ts")) {
  console.log("convex/_generated already present — skipping fallback codegen");
  process.exit(0);
}

const out = execSync(
  `find convex -name "*.ts" -not -path "convex/_generated/*" -not -path "convex/tests/*" -not -name "schema.ts" -not -name "auth.config.ts"`,
)
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((f) => f.replace(/^convex\//, "").replace(/\.ts$/, ""))
  .sort();

const ident = (m) => m.replace(/[\/.]/g, "_");
const imports = out
  .map((m) => `import type * as ${ident(m)} from "../${m}.js";`)
  .join("\n");
const entries = out.map((m) => `  "${m}": typeof ${ident(m)};`).join("\n");

const apiDts = `/* eslint-disable */
import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
${imports}

declare const fullApi: ApiFromModules<{
${entries}
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
`;

const apiJs = `/* eslint-disable */
import { anyApi } from "convex/server";
export const api = anyApi;
export const internal = anyApi;
`;

const serverJs = `/* eslint-disable */
import {
  actionGeneric,
  httpActionGeneric,
  queryGeneric,
  mutationGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  componentsGeneric,
} from "convex/server";

export const query = queryGeneric;
export const internalQuery = internalQueryGeneric;
export const mutation = mutationGeneric;
export const internalMutation = internalMutationGeneric;
export const action = actionGeneric;
export const internalAction = internalActionGeneric;
export const httpAction = httpActionGeneric;
export const components = componentsGeneric();
`;

const serverDts = `/* eslint-disable */
import type {
  ActionBuilder,
  AnyComponents,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

export declare const query: QueryBuilder<DataModel, "public">;
export declare const internalQuery: QueryBuilder<DataModel, "internal">;
export declare const mutation: MutationBuilder<DataModel, "public">;
export declare const internalMutation: MutationBuilder<DataModel, "internal">;
export declare const action: ActionBuilder<DataModel, "public">;
export declare const internalAction: ActionBuilder<DataModel, "internal">;
export declare const httpAction: HttpActionBuilder;

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
export declare const components: AnyComponents;
`;

const dataModelDts = `/* eslint-disable */
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type Doc<TableName extends TableNamesInDataModel<DataModel>> =
  DocumentByName<DataModel, TableName>;
export type Id<
  TableName extends TableNamesInDataModel<DataModel> | SystemTableNames,
> = GenericId<TableName>;
`;

mkdirSync("convex/_generated", { recursive: true });
writeFileSync("convex/_generated/api.d.ts", apiDts);
writeFileSync("convex/_generated/api.js", apiJs);
writeFileSync("convex/_generated/server.js", serverJs);
writeFileSync("convex/_generated/server.d.ts", serverDts);
writeFileSync("convex/_generated/dataModel.d.ts", dataModelDts);
console.log(`Fallback _generated written for ${out.length} modules`);
