// src/validators.js
import { z } from 'zod';

export const RaidSchema = z.object({
  title: z.string().min(1),
  date_iso: z.string().min(1), // "YYYY-MM-DDTHH:mm"
  size: z.number().int().min(5).max(40),
  description: z.string().optional().nullable().transform(v => v ?? ''),
  loottype: z.enum(['unsaved','saved','vip']),
  difficulty: z.enum(['Normal','Heroic','Mythic']),
});

export const RaidUpdateSchema = RaidSchema.partial(); // 👈 für PUT/PATCH

export const CharacterSchema = z.object({
  name: z.string().min(1),
  class: z.string().min(1),
  role: z.enum(['tank','heal','melee','ranged']),
  ilvl: z.number().int().min(0).max(1000).optional(),
  notes: z.string().optional().nullable().transform(v => v ?? ''),
});
