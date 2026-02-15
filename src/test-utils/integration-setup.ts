import { GenericContainer, Wait, type StartedNetwork, type StartedTestContainer, Network } from 'testcontainers';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import path from 'path';

const CUSTOM_IMAGE_NAME = process.env['FFMPEG_REST_TEST_IMAGE'];
const CUSTOM_IMAGE_PLATFORM = process.env['FFMPEG_REST_TEST_PLATFORM']?.trim() || undefined;
const DEFAULT_AUTO_IMAGE_PLATFORM = 'linux/amd64';
const IMAGE_PLATFORM = CUSTOM_IMAGE_NAME
  ? CUSTOM_IMAGE_PLATFORM
  : (CUSTOM_IMAGE_PLATFORM ?? DEFAULT_AUTO_IMAGE_PLATFORM);
const RUN_IMAGE_ID = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const IMAGE_NAME = CUSTOM_IMAGE_NAME ?? `ffmpeg-rest-test-${RUN_IMAGE_ID}`;
const REDIS_ALIAS = 'redis';
const LOCALSTACK_ALIAS = 'localstack';

export type IntegrationMode = 'stateless' | 's3';

export interface IntegrationSetupResult {
  mode: IntegrationMode;
  apiUrl: string;
  localstackEndpoint?: string;
}

interface EnvironmentState {
  readonly mode: IntegrationMode;
  readonly requiresS3: boolean;
  redisContainer: StartedRedisContainer | null;
  localstackContainer: StartedLocalStackContainer | null;
  appContainer: StartedTestContainer | null;
  network: StartedNetwork | null;
  apiUrl: string | null;
  setupInFlight: Promise<IntegrationSetupResult> | null;
  s3BucketInitialized: boolean;
  localstackEndpoint: string | null;
}

const environmentStates: Record<IntegrationMode, EnvironmentState> = {
  stateless: {
    mode: 'stateless',
    requiresS3: false,
    redisContainer: null,
    localstackContainer: null,
    appContainer: null,
    network: null,
    apiUrl: null,
    setupInFlight: null,
    s3BucketInitialized: false,
    localstackEndpoint: null
  },
  s3: {
    mode: 's3',
    requiresS3: true,
    redisContainer: null,
    localstackContainer: null,
    appContainer: null,
    network: null,
    apiUrl: null,
    setupInFlight: null,
    s3BucketInitialized: false,
    localstackEndpoint: null
  }
};

let imageBuildPromise: Promise<void> | null = null;
let imageBuilt = Boolean(CUSTOM_IMAGE_NAME);

export async function setupIntegrationTests(options?: { s3Mode?: boolean }): Promise<IntegrationSetupResult> {
  const mode: IntegrationMode = options?.s3Mode ? 's3' : 'stateless';
  const state = environmentStates[mode];

  if (!state.apiUrl) {
    populateStateFromEnv(state);
    if (state.apiUrl) {
      return buildResult(state);
    }
  }

  if (state.apiUrl && (!state.requiresS3 || state.localstackEndpoint)) {
    return buildResult(state);
  }

  if (state.setupInFlight) {
    return state.setupInFlight;
  }

  state.setupInFlight = performSetup(state)
    .catch((error) => {
      state.apiUrl = null;
      state.appContainer = null;
      state.redisContainer = null;
      state.localstackContainer = null;
      state.network = null;
      throw error;
    })
    .finally(() => {
      state.setupInFlight = null;
    });

  return state.setupInFlight;
}

export async function teardownIntegrationTests(options?: { s3Mode?: boolean }) {
  const mode: IntegrationMode = options?.s3Mode ? 's3' : 'stateless';
  await teardownMode(environmentStates[mode]);
}

export async function teardownAllIntegrationTests() {
  for (const mode of Object.keys(environmentStates) as IntegrationMode[]) {
    await teardownMode(environmentStates[mode]);
  }
}

export function getApiUrl(mode: IntegrationMode = 'stateless'): string {
  const state = environmentStates[mode];
  if (!state.apiUrl) {
    populateStateFromEnv(state);
  }
  if (!state.apiUrl) {
    throw new Error(`Integration tests for mode "${mode}" not set up. Call setupIntegrationTests() first.`);
  }
  return state.apiUrl;
}

export function getLocalStackEndpoint(mode: IntegrationMode = 's3'): string {
  if (mode !== 's3') {
    throw new Error('LocalStack container only available in S3 mode.');
  }

  const state = environmentStates[mode];

  if (!state.localstackEndpoint) {
    populateStateFromEnv(state);
  }

  if (!state.localstackEndpoint) {
    throw new Error('LocalStack endpoint not available. Call setupIntegrationTests({ s3Mode: true }) first.');
  }

  return state.localstackEndpoint;
}

async function performSetup(state: EnvironmentState): Promise<IntegrationSetupResult> {
  const { requiresS3 } = state;

  console.log(`[${state.mode}] Creating network...`);
  state.network = await new Network().start();

  console.log(`[${state.mode}] Starting Redis container...`);
  state.redisContainer = await new RedisContainer('redis:7.4-alpine')
    .withNetwork(state.network)
    .withNetworkAliases(REDIS_ALIAS)
    .start();

  const environment: Record<string, string> = {
    NODE_ENV: 'test',
    REDIS_URL: `redis://${REDIS_ALIAS}:6379`,
    STORAGE_MODE: 'stateless'
  };

  let localstackHostEndpoint: string | undefined;

  if (requiresS3) {
    console.log(`[${state.mode}] Starting LocalStack container...`);
    state.localstackContainer = await new LocalstackContainer('localstack/localstack:latest')
      .withNetwork(state.network)
      .withNetworkAliases(LOCALSTACK_ALIAS)
      .start();

    localstackHostEndpoint = state.localstackContainer.getConnectionUri();
    const localstackInternalEndpoint = `http://${LOCALSTACK_ALIAS}:4566`;

    environment['STORAGE_MODE'] = 's3';
    environment['S3_ENDPOINT'] = localstackInternalEndpoint;
    environment['S3_REGION'] = 'us-east-1';
    environment['S3_BUCKET'] = 'test-ffmpeg-bucket';
    environment['S3_ACCESS_KEY_ID'] = 'test';
    environment['S3_SECRET_ACCESS_KEY'] = 'test';
    environment['S3_PATH_PREFIX'] = 'test-media';

    if (!state.s3BucketInitialized) {
      console.log(`[${state.mode}] Ensuring S3 bucket exists...`);
      const s3Client = new S3Client({
        endpoint: localstackHostEndpoint,
        forcePathStyle: true,
        region: environment['S3_REGION'],
        credentials: {
          accessKeyId: environment['S3_ACCESS_KEY_ID'],
          secretAccessKey: environment['S3_SECRET_ACCESS_KEY']
        }
      });

      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: environment['S3_BUCKET'] }));
      } catch (error) {
        if (!isBucketAlreadyExistsError(error)) {
          throw error;
        }
      }

      state.s3BucketInitialized = true;
    }

    state.localstackEndpoint = localstackHostEndpoint;
  }

  await ensureImageBuilt();

  console.log(
    `[${state.mode}] Starting application container${IMAGE_PLATFORM ? ` (platform=${IMAGE_PLATFORM})` : ''}...`
  );

  const appContainer = new GenericContainer(IMAGE_NAME);
  if (IMAGE_PLATFORM) {
    appContainer.withPlatform(IMAGE_PLATFORM);
  }

  state.appContainer = await appContainer
    .withNetwork(state.network)
    .withEnvironment(environment)
    .withExposedPorts(3000)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  state.apiUrl = `http://${state.appContainer.getHost()}:${state.appContainer.getMappedPort(3000)}`;
  console.log(`[${state.mode}] API available at: ${state.apiUrl}`);

  return buildResult(state);
}

async function teardownMode(state: EnvironmentState) {
  if (state.setupInFlight) {
    await state.setupInFlight.then(
      () => undefined,
      () => undefined
    );
  }

  if (state.appContainer) {
    await state.appContainer.stop();
  }

  if (state.redisContainer) {
    await state.redisContainer.stop();
  }

  if (state.localstackContainer) {
    await state.localstackContainer.stop();
  }

  if (state.network) {
    await state.network.stop();
  }

  state.appContainer = null;
  state.redisContainer = null;
  state.localstackContainer = null;
  state.network = null;
  state.apiUrl = null;
  state.s3BucketInitialized = false;
  state.localstackEndpoint = null;
}

async function ensureImageBuilt() {
  if (CUSTOM_IMAGE_NAME) {
    return;
  }

  if (imageBuilt) {
    return;
  }

  if (!imageBuildPromise) {
    const imageBuilder = GenericContainer.fromDockerfile(path.join(__dirname, '../..')).withBuildkit();
    if (IMAGE_PLATFORM) {
      imageBuilder.withPlatform(IMAGE_PLATFORM);
    }

    console.log(`Building application image: ${IMAGE_NAME}${IMAGE_PLATFORM ? ` (platform=${IMAGE_PLATFORM})` : ''}...`);
    imageBuildPromise = imageBuilder
      .build(IMAGE_NAME, { deleteOnExit: true })
      .then(() => {
        imageBuilt = true;
      })
      .catch((error) => {
        imageBuilt = false;
        throw error;
      })
      .finally(() => {
        imageBuildPromise = null;
      });
  }

  await imageBuildPromise;
}

function buildResult(state: EnvironmentState): IntegrationSetupResult {
  if (!state.apiUrl) {
    throw new Error(`Integration test environment for mode "${state.mode}" not initialized.`);
  }

  if (state.requiresS3 && !state.localstackEndpoint) {
    throw new Error('LocalStack endpoint not initialized.');
  }

  return {
    mode: state.mode,
    apiUrl: state.apiUrl,
    localstackEndpoint: state.localstackEndpoint ?? undefined
  };
}

function isBucketAlreadyExistsError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const knownCodes = new Set(['BucketAlreadyOwnedByYou', 'BucketAlreadyExists']);
  const name = (error as { name?: string }).name;
  const code = (error as { Code?: string }).Code;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;

  return Boolean((name && knownCodes.has(name)) || (code && knownCodes.has(code)) || status === 409);
}

function populateStateFromEnv(state: EnvironmentState) {
  const prefix = state.mode === 's3' ? 'FFMPEG_REST_S3' : 'FFMPEG_REST_STATELESS';
  const apiUrl = process.env[`${prefix}_API_URL`];
  if (apiUrl) {
    state.apiUrl = apiUrl;
  }

  if (state.requiresS3) {
    const endpoint = process.env['FFMPEG_REST_S3_LOCALSTACK_URL'];
    if (endpoint) {
      state.localstackEndpoint = endpoint;
    }
  }
}
