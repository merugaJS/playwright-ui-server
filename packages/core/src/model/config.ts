import { z } from 'zod';

export const ViewportSchema = z.object({
  width: z.number(),
  height: z.number(),
});

export const ProjectUseSchema = z.object({
  browserName: z.enum(['chromium', 'firefox', 'webkit']).optional(),
  viewport: ViewportSchema.optional(),
  device: z.string().optional(),
  baseURL: z.string().optional(),
});

export const PlaywrightProjectSchema = z.object({
  name: z.string(),
  testDir: z.string().optional(),
  use: ProjectUseSchema.optional(),
});

export const PlaywrightConfigSchema = z.object({
  testDir: z.string().default('./tests'),
  testMatch: z.union([z.string(), z.array(z.string())]).optional(),
  testIgnore: z.union([z.string(), z.array(z.string())]).optional(),
  baseURL: z.string().optional(),
  projects: z.array(PlaywrightProjectSchema).optional(),
  outputDir: z.string().optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
  workers: z.union([z.number(), z.string()]).optional(),
  reporter: z.union([
    z.string(),
    z.array(z.union([z.string(), z.tuple([z.string(), z.record(z.unknown())])])),
  ]).optional(),
  globalSetup: z.string().optional(),
  globalTeardown: z.string().optional(),
});

export type Viewport = z.infer<typeof ViewportSchema>;
export type ProjectUse = z.infer<typeof ProjectUseSchema>;
export type PlaywrightProject = z.infer<typeof PlaywrightProjectSchema>;
export type PlaywrightConfig = z.infer<typeof PlaywrightConfigSchema>;
