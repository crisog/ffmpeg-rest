import { CreateBucketCommand, type S3Client } from '@aws-sdk/client-s3';

export async function ensureBucketExists(client: S3Client, bucket: string) {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (!isBucketAlreadyExistsError(error)) {
      throw error;
    }
  }
}

function isBucketAlreadyExistsError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = (error as { name?: string }).name;
  const code = (error as { Code?: string }).Code;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;

  return (
    name === 'BucketAlreadyOwnedByYou' ||
    name === 'BucketAlreadyExists' ||
    code === 'BucketAlreadyOwnedByYou' ||
    code === 'BucketAlreadyExists' ||
    status === 409
  );
}
