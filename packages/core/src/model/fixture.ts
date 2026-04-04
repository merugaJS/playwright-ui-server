import { z } from 'zod';

export const FixtureDefinitionSchema = z.object({
  name: z.string(),
  filePath: z.string(),
  type: z.string(), // TypeScript type annotation
  isBuiltIn: z.boolean(), // true for page, context, browser, request, etc.
  setupCode: z.string().optional(), // Code before the use() call
  teardownCode: z.string().optional(), // Code after the use() call
  scope: z.enum(['test', 'worker']).optional(), // Fixture scope
  auto: z.boolean().optional(), // Auto-fixture (runs for every test without being requested)
  dependencies: z.array(z.string()).default([]), // Other fixtures this fixture depends on
});
export type FixtureDefinition = z.infer<typeof FixtureDefinitionSchema>;
