import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getPackageVersion } from './utils.js';
import { registerTools } from './tools/index.js';

export const createServer = (): McpServer => {
  const server = new McpServer(
    {
      name: 'ffmpeg-rest-mcp',
      title: 'FFmpeg REST MCP Server',
      version: getPackageVersion()
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  registerTools(server);
  return server;
};

export const startServer = async (): Promise<void> => {
  const server = createServer();
  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
  } catch (error) {
    console.error('Failed to start MCP server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};
