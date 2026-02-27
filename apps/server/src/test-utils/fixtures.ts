import { execSync } from 'child_process';

export function createTestPngFile(outputPath: string, width = 320, height = 240): void {
  execSync(`ffmpeg -f lavfi -i color=c=blue:s=${width}x${height}:d=1 -frames:v 1 -y "${outputPath}"`, {
    stdio: 'pipe'
  });
}

export function createTestWavFile(outputPath: string): void {
  execSync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=1" -ar 44100 -ac 2 -y "${outputPath}"`, {
    stdio: 'pipe'
  });
}

export function createTestMp3File(outputPath: string): void {
  execSync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=1" -codec:a libmp3lame -qscale:a 2 -y "${outputPath}"`, {
    stdio: 'pipe'
  });
}

export function createTestAviFile(outputPath: string): void {
  execSync(
    `ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -f lavfi -i sine=frequency=1000:duration=2:sample_rate=44100 -ac 2 -pix_fmt yuv420p -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}
