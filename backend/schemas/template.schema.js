import { z } from 'zod';

const variableSchema = z.string()
  .trim()
  .min(1)
  .max(100);

export const createTemplateSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  canal: z.enum(['EMAIL', 'SMS']),
  contenido: z.string().refine((value) => value.trim().length > 0),
  variables: z.array(variableSchema).superRefine((variables, context) => {
    const uniqueVariables = new Set(variables);
    if (uniqueVariables.size !== variables.length) {
      context.addIssue({
        code: 'custom',
        message: 'Las variables no pueden repetirse'
      });
    }
  })
}).strict();

const POSTGRES_BIGINT_MAX = 9223372036854775807n;

export const templateParamsSchema = z.object({
  id: z.string()
    .regex(/^[1-9]\d*$/)
    .refine((value) => (
      !/^[1-9]\d*$/.test(value) || BigInt(value) <= POSTGRES_BIGINT_MAX
    ))
}).strict();
