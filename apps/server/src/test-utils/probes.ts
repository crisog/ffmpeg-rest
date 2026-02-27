import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

export function getImageDimensions(buffer: ArrayBuffer, tempDir: string): { width: number; height: number } {
  const tempPath = path.join(tempDir, `temp-${Date.now()}.png`);
  ensureDir(tempDir);
  writeFileSync(tempPath, Buffer.from(buffer));
  try {
    const output = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${tempPath}"`
    ).toString();
    const data = JSON.parse(output);
    return {
      width: data.streams[0].width,
      height: data.streams[0].height
    };
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function getAudioInfo(
  buffer: ArrayBuffer,
  tempDir: string
): { codec: string; channels: number; sampleRate: number } {
  const tempPath = path.join(tempDir, `temp-${Date.now()}.audio`);
  ensureDir(tempDir);
  writeFileSync(tempPath, Buffer.from(buffer));
  try {
    const output = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,channels,sample_rate -of json "${tempPath}"`
    ).toString();
    const data = JSON.parse(output);
    const stream = data.streams[0];
    return {
      codec: stream.codec_name,
      channels: stream.channels,
      sampleRate: parseInt(stream.sample_rate, 10)
    };
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function getAudioChannels(buffer: ArrayBuffer, tempDir: string): number {
  const tempPath = path.join(tempDir, `temp-${Date.now()}.wav`);
  ensureDir(tempDir);
  writeFileSync(tempPath, Buffer.from(buffer));
  try {
    const output = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=channels -of json "${tempPath}"`
    ).toString();
    const data = JSON.parse(output);
    return data.streams[0].channels;
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function getVideoInfo(
  buffer: ArrayBuffer,
  tempDir: string
): { videoCodec: string; hasVideo: boolean; hasAudio: boolean } {
  const tempPath = path.join(tempDir, `temp-${Date.now()}.mp4`);
  ensureDir(tempDir);
  writeFileSync(tempPath, Buffer.from(buffer));
  try {
    const output = execSync(
      `ffprobe -v error -show_entries stream=codec_type,codec_name -of json "${tempPath}"`
    ).toString();
    const data = JSON.parse(output);
    const streams = data.streams || [];
    const videoStream = streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    const audioStream = streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
    return {
      videoCodec: videoStream?.codec_name || '',
      hasVideo: !!videoStream,
      hasAudio: !!audioStream
    };
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function countFilesInZip(buffer: ArrayBuffer, tempDir: string): number {
  const tempPath = path.join(tempDir, `temp-${Date.now()}.zip`);
  ensureDir(tempDir);
  writeFileSync(tempPath, Buffer.from(buffer));
  try {
    const output = execSync(`unzip -l "${tempPath}" | tail -1`).toString();
    const match = output.match(/(\d+)\s+files?/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
