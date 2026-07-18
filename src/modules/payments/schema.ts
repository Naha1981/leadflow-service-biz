import { z } from "zod";

export const createOrderSchema = z.object({
  leadId: z.string().uuid().optional(),
  amount: z.number().positive(),
  description: z.string().min(1),
  businessName: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
