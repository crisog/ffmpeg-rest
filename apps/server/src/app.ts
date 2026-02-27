import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown';
import { bearerAuth } from 'hono/bearer-auth';
import { env } from '~/config/env';
import { logger } from '~/config/logger';
import { registerApiRoutes } from '~/components/api/controller';
import { registerAudioRoutes } from '~/components/audio/controller';
import { registerVideoRoutes } from '~/components/video/controller';
import { registerImageRoutes } from '~/components/image/controller';
import { registerMediaRoutes } from '~/components/media/controller';

export function createApp() {
  const app = new OpenAPIHono();

  if (env.AUTH_TOKEN) {
    logger.info('🔒 Bearer authentication enabled');
    app.use('/*', bearerAuth({ token: env.AUTH_TOKEN }));
  } else {
    logger.warn('⚠️  Authentication disabled - set AUTH_TOKEN to enable');
  }

  registerApiRoutes(app);
  registerAudioRoutes(app);
  registerVideoRoutes(app);
  registerImageRoutes(app);
  registerMediaRoutes(app);

  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'FFmpeg REST API',
      description: 'A REST API wrapper for FFmpeg media processing operations'
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ]
  });

  app.get(
    '/reference',
    Scalar({
      url: '/doc',
      theme: 'purple',
      pageTitle: 'FFmpeg REST API Reference'
    })
  );

  /**
   * LLM-friendly documentation endpoint
   * Serves the API documentation in markdown format for LLMs
   *
   * @see https://llmstxt.org/
   */
  app.get('/llms.txt', async (c) => {
    const openApiDoc = app.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {
        version: '1.0.0',
        title: 'FFmpeg REST API',
        description: 'A REST API wrapper for FFmpeg media processing operations'
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server'
        }
      ]
    });

    const markdown = await createMarkdownFromOpenApi(JSON.stringify(openApiDoc));
    return c.text(markdown);
  });

  return app;
}
