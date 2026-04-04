import { z } from 'zod';

/**
 * Schema for a parameter of a utility/helper function.
 */
export const UtilityFunctionParamSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
});
export type UtilityFunctionParam = z.infer<typeof UtilityFunctionParamSchema>;

/**
 * Classification of a utility function:
 * - 'helper': accepts Playwright-specific parameters (Page, BrowserContext, etc.)
 * - 'utility': general-purpose function with no Playwright dependencies
 */
export const UtilityFunctionKindSchema = z.enum(['helper', 'utility']);
export type UtilityFunctionKind = z.infer<typeof UtilityFunctionKindSchema>;

/**
 * Schema for a parsed utility/helper function.
 */
export const UtilityFunctionSchema = z.object({
  /** Function name */
  name: z.string(),
  /** File path where the function is defined */
  filePath: z.string(),
  /** Module specifier for imports */
  modulePath: z.string(),
  /** Whether this is a Playwright test helper or a general utility */
  kind: UtilityFunctionKindSchema,
  /** Function parameters */
  parameters: z.array(UtilityFunctionParamSchema),
  /** Whether the function is async */
  isAsync: z.boolean(),
  /** Whether the function is exported */
  isExported: z.boolean(),
  /** Optional description extracted from JSDoc */
  description: z.string().optional(),
});
export type UtilityFunction = z.infer<typeof UtilityFunctionSchema>;
