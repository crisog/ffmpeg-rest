import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAudioTools } from './audio.js';
import { registerVideoTools } from './video.js';
import { registerImageTools } from './image.js';
import { registerMediaTools } from './media.js';

export const registerTools = (server: McpServer): void => {
  registerAudioTools(server);
  registerVideoTools(server);
  registerImageTools(server);
  registerMediaTools(server);
};
