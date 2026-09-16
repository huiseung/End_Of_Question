import { z } from 'zod';
export const storySchema = z.object({
  truth: z.string().min(1), facts: z.array(z.string().min(1)).min(1),
  requiredFacts: z.array(z.object({ code: z.string().min(1), description: z.string().min(1) })).min(1),
}).superRefine((story, ctx) => {
  if (new Set(story.requiredFacts.map(f => f.code)).size !== story.requiredFacts.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate required fact codes' });
});
export type Story = z.infer<typeof storySchema>;
