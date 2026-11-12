import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';

const basicSearchSchema = z.object({
  network: z.string().optional(),
});

export const validateSearch = zodValidator(basicSearchSchema);

export const minersSearchSchema = basicSearchSchema.extend({
  window: z.enum(['1d', '7d', '28d']).optional(),
});

export const validateMinersSearch = zodValidator(minersSearchSchema);

export const forecastSearchSchema = basicSearchSchema.extend({
  height: z.coerce.number().int().nonnegative().optional().catch(undefined),
});

export const validateForecastSearch = zodValidator(forecastSearchSchema);
