import { createRoute, z } from '@hono/zod-openapi';
import { FileSchema, ErrorSchema, UrlResponseSchema, ResizeQuerySchema } from '~/utils/schemas';

/**
 * POST /image/jpg - Convert any image format to JPG
 */
export const imageToJpgRoute = createRoute({
  method: 'post',
  path: '/image/jpg',
  tags: ['Image'],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'image/jpeg': {
          schema: FileSchema
        }
      },
      description: 'Image converted to JPG format'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid image file or unsupported format'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Conversion failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * POST /image/jpg/url - Convert any image format to JPG and return S3 URL
 */
export const imageToJpgUrlRoute = createRoute({
  method: 'post',
  path: '/image/jpg/url',
  tags: ['Image'],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UrlResponseSchema
        }
      },
      description: 'Image converted to JPG and uploaded to S3'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid image file or S3 mode not enabled'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Conversion failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * POST /image/resize - Resize image preserving original format
 */
export const imageResizeRoute = createRoute({
  method: 'post',
  path: '/image/resize',
  tags: ['Image'],
  request: {
    query: ResizeQuerySchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/octet-stream': {
          schema: FileSchema
        }
      },
      description: 'Image resized (preserves original format)'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid parameters or image file'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Resize failed'
    }
  }
});

/**
 * POST /image/resize/url - Resize image and return S3 URL
 */
export const imageResizeUrlRoute = createRoute({
  method: 'post',
  path: '/image/resize/url',
  tags: ['Image'],
  request: {
    query: ResizeQuerySchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UrlResponseSchema
        }
      },
      description: 'Image resized and uploaded to S3'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid parameters, image file, or S3 mode not enabled'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Resize failed'
    }
  }
});
