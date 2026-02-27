import { createRoute, z } from '@hono/zod-openapi';
import { EndpointsResponseSchema, ErrorSchema } from '~/utils/schemas';

/**
 * GET / - API Readme
 */
export const getReadmeRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['General'],
  responses: {
    200: {
      content: {
        'text/html': {
          schema: z.string().openapi({
            example: '<h1>FFmpeg REST API</h1>'
          })
        }
      },
      description: 'API documentation and readme'
    }
  }
});

/**
 * GET /endpoints - Service endpoints as JSON
 */
export const getEndpointsRoute = createRoute({
  method: 'get',
  path: '/endpoints',
  tags: ['General'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: EndpointsResponseSchema
        }
      },
      description: 'List of all available endpoints'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Internal server error'
    }
  }
});
