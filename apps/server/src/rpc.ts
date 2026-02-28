import { OpenAPIHono } from '@hono/zod-openapi';
import { registerApiRoutes } from '~/components/api/controller';

export const rpcApp = registerApiRoutes(new OpenAPIHono());
export type AppType = typeof rpcApp;
