import { z } from "zod";

export const createTenantSchema = z.object({
  businessName: z.string().min(1),
  niche: z.string().min(1),
  ownerName: z.string().optional(),
  ownerEmail: z.string().email().optional(),
  ownerPhone: z.string().optional(),
  monthlyFee: z.number().positive().default(700),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
