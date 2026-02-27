import { setupIntegrationTests, teardownAllIntegrationTests } from './apps/server/src/test-utils/integration-setup';

export default async function globalSetup() {
  const [stateless, s3] = await Promise.all([setupIntegrationTests(), setupIntegrationTests({ s3Mode: true })]);

  process.env['FFMPEG_REST_STATELESS_API_URL'] = stateless.apiUrl;
  process.env['FFMPEG_REST_S3_API_URL'] = s3.apiUrl;
  if (s3.localstackEndpoint) {
    process.env['FFMPEG_REST_S3_LOCALSTACK_URL'] = s3.localstackEndpoint;
  }
  process.env['FFMPEG_REST_S3_BUCKET'] = 'test-ffmpeg-bucket';

  return async () => {
    await teardownAllIntegrationTests();
  };
}
