import { createRoute, z } from '@hono/zod-openapi';
import { FileSchema, ErrorSchema, UrlResponseSchema } from '~/utils/schemas';

/**
 * POST /audio/mp3 - Convert any audio format to MP3
 */
export const audioToMp3Route = createRoute({
  method: 'post',
  path: '/audio/mp3',
  tags: ['Audio'],
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
        'audio/mpeg': {
          schema: FileSchema
        }
      },
      description: 'Audio converted to MP3 format'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid audio file or unsupported format'
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
 * POST /audio/mp3/url - Convert any audio format to MP3 and return S3 URL
 */
export const audioToMp3UrlRoute = createRoute({
  method: 'post',
  path: '/audio/mp3/url',
  tags: ['Audio'],
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
      description: 'Audio converted to MP3 and uploaded to S3'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid audio file or S3 mode not enabled'
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
 * POST /audio/wav - Convert any audio format to WAV
 */
export const audioToWavRoute = createRoute({
  method: 'post',
  path: '/audio/wav',
  tags: ['Audio'],
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
        'audio/wav': {
          schema: FileSchema
        }
      },
      description: 'Audio converted to WAV format'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid audio file or unsupported format'
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
 * POST /audio/wav/url - Convert any audio format to WAV and return S3 URL
 */
export const audioToWavUrlRoute = createRoute({
  method: 'post',
  path: '/audio/wav/url',
  tags: ['Audio'],
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
      description: 'Audio converted to WAV and uploaded to S3'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid audio file or S3 mode not enabled'
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
