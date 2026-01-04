import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';

const basicSearchSchema = z.object({
  network: z.string().optional(),
});

export const validateSearch = zodValidator(basicSearchSchema);

const loaderDeps = ({
  search: { network },
}: {
  search: { network: string };
}) => {
  return { network };
};
