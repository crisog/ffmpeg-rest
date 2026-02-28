import { Progress } from '@base-ui/react/progress';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

export const Route = createFileRoute('/')({
  component: HomePage
});

type WorkflowStage = 'idle' | 'input_ready' | 'processing' | 'success' | 'error';
type MainType = 'video' | 'audio' | 'image' | 'unknown';
type VideoTarget = 'video/mp4' | 'video/gif' | 'audio/wav' | 'frames/archive';

interface ConversionResult {
  downloadUrl: string;
  outputName: string;
  outputMime: string;
  target: VideoTarget;
  inputBytes: number;
  outputBytes: number;
}

const VIDEO_EXTENSION_PATTERN = /\.(mp4|m4v|mov|avi|mkv|webm|mpeg|mpg)$/i;
const AUDIO_EXTENSION_PATTERN = /\.(mp3|wav|aac|m4a|ogg|flac|aiff|alac)$/i;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpg|jpeg|gif|webp|bmp|tif|tiff)$/i;

interface ConversionOption {
  id: VideoTarget;
  label: string;
  endpoint: string;
  outputExt: string;
  outputMime: string;
}

const VIDEO_CONVERSION_OPTIONS: readonly ConversionOption[] = [
  {
    id: 'video/mp4',
    label: 'MP4',
    endpoint: '/api/video/mp4',
    outputExt: 'mp4',
    outputMime: 'video/mp4'
  },
  {
    id: 'video/gif',
    label: 'GIF',
    endpoint: '/api/video/gif?fps=10',
    outputExt: 'gif',
    outputMime: 'image/gif'
  },
  {
    id: 'audio/wav',
    label: 'WAV',
    endpoint: '/api/video/audio?mono=yes',
    outputExt: 'wav',
    outputMime: 'audio/wav'
  },
  {
    id: 'frames/archive',
    label: 'Frames',
    endpoint: '/api/video/frames?fps=1&compress=zip',
    outputExt: 'zip',
    outputMime: 'application/zip'
  }
] as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function normalizeOutputName(sourceName: string, option: ConversionOption): string {
  const base = sourceName.replace(/\.[^./\\]+$/, '') || 'media';
  return option.id === 'frames/archive'
    ? `${base}-frames.${option.outputExt}`
    : `${base}-converted.${option.outputExt}`;
}

function parseFilenameFromContentDisposition(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const basicMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  return basicMatch?.[1]?.trim() || null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\x20-\x7E]/g, '_');
}

function detectMainType(file: File): MainType {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith('video/') || VIDEO_EXTENSION_PATTERN.test(name)) return 'video';
  if (type.startsWith('audio/') || AUDIO_EXTENSION_PATTERN.test(name)) return 'audio';
  if (type.startsWith('image/') || IMAGE_EXTENSION_PATTERN.test(name)) return 'image';
  return 'unknown';
}

function getOptionById(id: VideoTarget): ConversionOption | null {
  return VIDEO_CONVERSION_OPTIONS.find((option) => option.id === id) ?? null;
}

async function buildApiError(response: Response, endpoint: string): Promise<Error> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      const message = payload.message || payload.error;
      if (message) return new Error(message);
    } catch {
      return new Error(`Conversion failed (${response.status})`);
    }
  }
  if (contentType.includes('text/html')) {
    return new Error(`Received HTML from ${endpoint}. Check apps/web/.env BACKEND_URL points to your API server.`);
  }
  const body = await response.text();
  return new Error(body.trim() || `Conversion failed (${response.status})`);
}

async function runConversion(file: File, option: ConversionOption): Promise<ConversionResult> {
  const formData = new FormData();
  formData.append('file', file, sanitizeFilename(file.name));
  const response = await fetch(option.endpoint, { method: 'POST', body: formData });
  if (!response.ok) throw await buildApiError(response, option.endpoint);
  const outputBlob = await response.blob();
  if (outputBlob.size === 0) throw new Error('Conversion failed: API returned an empty file.');
  const outputName =
    parseFilenameFromContentDisposition(response.headers.get('content-disposition')) ||
    normalizeOutputName(file.name, option);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || option.outputMime;
  return {
    downloadUrl: URL.createObjectURL(outputBlob),
    outputName,
    outputMime: contentType,
    target: option.id,
    inputBytes: file.size,
    outputBytes: outputBlob.size
  };
}

/* ────────────────────────────────────────── */

function HomePage(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<WorkflowStage>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedType, setDetectedType] = useState<MainType>('unknown');
  const [selectedTargetId, setSelectedTargetId] = useState<VideoTarget | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const isProcessing = stage === 'processing';

  const selectedTarget = useMemo(() => (selectedTargetId ? getOptionById(selectedTargetId) : null), [selectedTargetId]);

  const compressionStats = useMemo(() => {
    if (!result) return null;
    const byteDelta = result.outputBytes - result.inputBytes;
    const percentDelta = result.inputBytes > 0 ? (byteDelta / result.inputBytes) * 100 : 0;
    return { byteDelta, percentDelta, reduced: byteDelta < 0 };
  }, [result]);

  // Video preview URL lifecycle
  useEffect(() => {
    if (!selectedFile || detectedType !== 'video') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile, detectedType]);

  // Cleanup result blob on unmount
  useEffect(() => {
    return () => {
      if (result?.downloadUrl) URL.revokeObjectURL(result.downloadUrl);
    };
  }, [result?.downloadUrl]);

  // Fake progress for processing state
  useEffect(() => {
    if (!isProcessing) {
      setProgress(0);
      return;
    }
    setProgress(0);
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return p + (90 - p) * 0.08;
      });
    }, 200);
    return () => clearInterval(id);
  }, [isProcessing]);

  const resetResult = (): void => {
    setResult((current) => {
      if (current?.downloadUrl) URL.revokeObjectURL(current.downloadUrl);
      return null;
    });
  };

  const resetWorkflow = (): void => {
    resetResult();
    setSelectedFile(null);
    setDetectedType('unknown');
    setSelectedTargetId(null);
    setStage('idle');
    setErrorMessage('');
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyFile = (file: File): void => {
    const mainType = detectMainType(file);
    setSelectedFile(file);
    setDetectedType(mainType);
    setSelectedTargetId(null);
    setIsDragging(false);
    resetResult();

    if (mainType !== 'video') {
      setStage('error');
      setErrorMessage(
        mainType === 'unknown'
          ? 'Unrecognized file type. Drop a video — MP4, MOV, AVI, MKV, or WEBM.'
          : `Detected ${mainType}. Only video files are supported right now.`
      );
      return;
    }
    setStage('input_ready');
    setErrorMessage('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.item(0);
    if (f) applyFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>): void => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.item(0);
    if (f) applyFile(f);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>): void => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setIsDragging(false);
  };

  const handleConvert = async (targetId: VideoTarget): Promise<void> => {
    if (!selectedFile) return;
    const option = getOptionById(targetId);
    if (!option) return;

    setSelectedTargetId(targetId);
    setStage('processing');
    setErrorMessage('');
    resetResult();

    try {
      const nextResult = await runConversion(selectedFile, option);
      setResult((current) => {
        if (current?.downloadUrl) URL.revokeObjectURL(current.downloadUrl);
        return nextResult;
      });
      setProgress(100);
      setStage('success');
    } catch (error) {
      setStage('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected conversion error.');
    }
  };

  const startOver = (): void => resetWorkflow();

  const convertAgain = (): void => {
    resetResult();
    setSelectedTargetId(null);
    setStage('input_ready');
    setErrorMessage('');
  };

  /* ── Render ────────────────────────────── */

  return (
    <div className="flex flex-1 flex-col items-center px-4 pt-[12vh] pb-8">
      <div
        className="canvas reveal relative w-full max-w-[540px]"
        onDragOver={(e) => {
          e.preventDefault();
          if (stage !== 'processing') setIsDragging(true);
        }}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          if (stage !== 'processing') handleDrop(e);
        }}
      >
        <input
          id="file-input"
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={handleFileChange}
        />

        {/* ── Idle: drop zone ────────────── */}
        {stage === 'idle' && !selectedFile && (
          <label
            htmlFor="file-input"
            className={`flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-dashed transition-all duration-300 ${
              isDragging
                ? 'border-accent bg-accent-soft/40 scale-[1.01]'
                : 'border-stone-strong bg-surface/60 hover:border-accent/60 hover:bg-surface'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex size-12 items-center justify-center rounded-full border border-stone-strong bg-elevated">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-ink-muted">
                <path
                  d="M10 3v10m0-10L6.5 6.5M10 3l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 13v2a2 2 0 002 2h10a2 2 0 002-2v-2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-ink">Drop a video file</p>
              <p className="mt-1 text-xs text-ink-muted">or click to browse</p>
            </div>
          </label>
        )}

        {/* ── Input ready: preview + format picker ── */}
        {stage === 'input_ready' && selectedFile && (
          <div className="space-y-4">
            {previewUrl ? (
              <div className="group relative overflow-hidden rounded-[var(--radius-xl)] border border-stone bg-void">
                <video className="aspect-video w-full object-contain" src={previewUrl} />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-void/90 to-transparent px-4 pb-3 pt-8">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">{selectedFile.name}</p>
                    <p className="text-[11px] text-ink-muted">{formatBytes(selectedFile.size)}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-[11px] text-ink-muted transition-colors hover:text-ink"
                    onClick={startOver}
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[140px] items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-stone bg-surface px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{selectedFile.name}</p>
                  <p className="text-xs text-ink-muted">{formatBytes(selectedFile.size)}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-ink-muted transition-colors hover:text-ink"
                  onClick={startOver}
                >
                  Change
                </button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-center text-[11px] uppercase tracking-widest text-ink-muted">Convert to</p>
              <div className="flex items-center justify-center gap-2">
                {VIDEO_CONVERSION_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void handleConvert(option.id)}
                    className="format-pill rounded-[var(--radius-md)] border border-stone-strong bg-elevated px-4 py-2 text-xs font-medium text-ink-secondary transition-all hover:border-accent hover:bg-accent-soft hover:text-ink"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Processing ─────────────────── */}
        {stage === 'processing' && selectedFile && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-stone bg-void">
              {previewUrl ? (
                <video className="aspect-video w-full object-contain opacity-40" src={previewUrl} />
              ) : (
                <div className="aspect-video w-full" />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="size-8 animate-spin rounded-full border-2 border-accent border-r-transparent" />
                <p className="text-xs font-medium text-ink">Converting to {selectedTarget?.label}</p>
              </div>
            </div>
            <Progress.Root value={progress} className="mx-auto w-full max-w-[400px]">
              <Progress.Track className="h-[3px] overflow-hidden rounded-full bg-stone">
                <Progress.Indicator className="h-full rounded-full bg-accent transition-all duration-300 ease-out" />
              </Progress.Track>
            </Progress.Root>
          </div>
        )}

        {/* ── Success ────────────────────── */}
        {stage === 'success' && result && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[var(--radius-xl)] border border-accent/30 bg-void">
              {result.target === 'video/mp4' && (
                <video
                  key={result.downloadUrl}
                  className="aspect-video w-full object-contain"
                  controls
                  autoPlay
                  src={result.downloadUrl}
                />
              )}
              {result.target === 'video/gif' && (
                <img
                  key={result.downloadUrl}
                  className="aspect-video w-full object-contain"
                  src={result.downloadUrl}
                  alt="Converted GIF"
                />
              )}
              {result.target === 'audio/wav' && (
                <div className="flex aspect-video items-center justify-center px-6">
                  <audio key={result.downloadUrl} className="w-full" controls autoPlay src={result.downloadUrl} />
                </div>
              )}
              {result.target === 'frames/archive' && (
                <div className="flex aspect-video flex-col items-center justify-center gap-2">
                  <div className="flex size-12 items-center justify-center rounded-full border border-stone-strong bg-elevated">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-accent">
                      <path
                        d="M6 9.5L8 11.5L12 6.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <rect x="1" y="1" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-ink">Frames extracted</p>
                  <p className="text-xs text-ink-muted">{result.outputName}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-6 text-xs text-ink-muted">
              <span>{formatBytes(result.inputBytes)} in</span>
              <span className="text-ink-secondary">→</span>
              <span>{formatBytes(result.outputBytes)} out</span>
              {compressionStats && (
                <>
                  <span className="text-ink-secondary">·</span>
                  <span className={compressionStats.reduced ? 'text-success' : 'text-signal'}>
                    {compressionStats.reduced ? '' : '+'}
                    {compressionStats.percentDelta.toFixed(1)}%
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <a className="btn-primary" href={result.downloadUrl} download={result.outputName}>
                Download
              </a>
              <button type="button" className="btn-ghost" onClick={convertAgain}>
                Convert again
              </button>
              <button type="button" className="btn-ghost" onClick={startOver}>
                New file
              </button>
            </div>
          </div>
        )}

        {/* ── Error ──────────────────────── */}
        {stage === 'error' && (
          <div className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-error/40 bg-error-soft/30 px-5 py-6 text-center">
              <p className="text-sm text-error">{errorMessage}</p>
            </div>
            <div className="flex justify-center">
              <button type="button" className="btn-ghost" onClick={startOver}>
                Start over
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
