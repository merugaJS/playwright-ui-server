import { z } from 'zod';
import { LocatorStrategySchema } from './action-node.js';

export const PageObjectLocatorSchema = z.object({
  name: z.string(),
  strategy: LocatorStrategySchema,
  value: z.string(),
});
export type PageObjectLocator = z.infer<typeof PageObjectLocatorSchema>;

export const PageObjectMethodParamSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export const PageObjectMethodSchema = z.object({
  name: z.string(),
  parameters: z.array(PageObjectMethodParamSchema),
  body: z.string(), // Raw TypeScript code for the method body
});
export type PageObjectMethod = z.infer<typeof PageObjectMethodSchema>;

export const PageObjectSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  name: z.string(), // Class name
  locators: z.array(PageObjectLocatorSchema),
  methods: z.array(PageObjectMethodSchema),
});
export type PageObject = z.infer<typeof PageObjectSchema>;
