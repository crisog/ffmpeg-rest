import { hc } from 'hono/client';
import type { AppType } from '../../../server/src/rpc';

export const rpcClient = hc<AppType>('/api');
