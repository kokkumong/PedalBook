import { z } from 'zod';

export const portSchema = z.object({
  edge: z.enum(['left', 'right', 'top', 'bottom']),
  offsetPct: z.number().finite().min(5).max(95),
  heightMm: z.number().finite().min(1).max(500).optional(),
});
export const signalSchema = z.object({
  nodes: z.array(z.object({ instanceId: z.string().min(1).max(100), input: portSchema, output: portSchema })).max(100),
  plugWidthMm: z.number().finite().min(4).max(40),
  plugLengthMm: z.number().finite().min(5).max(60),
  cableDiameterMm: z.number().finite().min(1).max(12),
  visible: z.boolean(),
}).refine(chain => new Set(chain.nodes.map(node => node.instanceId)).size === chain.nodes.length, '시그널 순서에 같은 페달이 중복됩니다.');
export type SignalChain = z.infer<typeof signalSchema>;
export type SignalNode = SignalChain['nodes'][number];
export type SignalPort = z.infer<typeof portSchema>;
export const emptySignal = (): SignalChain => ({ nodes: [], plugWidthMm: 12, plugLengthMm: 14, cableDiameterMm: 4, visible: true });
// Editable placement assumptions, not manufacturer-verified jack coordinates.
export const signalNode = (instanceId: string): SignalNode => ({ instanceId, input: { edge: 'right', offsetPct: 30 }, output: { edge: 'left', offsetPct: 30 } });
