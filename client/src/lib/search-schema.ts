import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';

export const basicSearchSchema = z.object({
  network: z.string().optional(),
});

export const validateSearch = zodValidator(basicSearchSchema);

export const loaderDeps = ({
  search: { network },
}: {
  search: { network: string };
}) => {
  return { network };
};
