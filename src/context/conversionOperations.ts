import { Command } from "@tauri-apps/plugin-shell";
import { FileWithPath } from "../types";

export const handleConvert = async (
  file: FileWithPath,
  onProgress: (progress: number) => void
): Promise<void> => {
  if (!file.name) return;

  const mp4File = file.fullPath.replace(".mkv", ".mp4");

  const command = Command.create("ffmpeg-convert", [
    "-i",
    file.fullPath,
    "-map",
    "0:v",
    "-map",
    "0:a",
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-strict",
    "unofficial",
    mp4File,
  ]);

  let duration: number | null = null;

  command.stdout.on("data", (line: string) => {
    if (line.startsWith("Duration:")) {
      const timeMatch = line.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
      if (timeMatch) {
        duration =
          parseInt(timeMatch[1]) * 3600 +
          parseInt(timeMatch[2]) * 60 +
          parseInt(timeMatch[3]);
      }
    } else if (line.startsWith("time=") && duration) {
      const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})/);
      if (timeMatch) {
        const currentTime =
          parseInt(timeMatch[1]) * 3600 +
          parseInt(timeMatch[2]) * 60 +
          parseInt(timeMatch[3]);
        const progress = Math.round((currentTime / duration) * 100);
        onProgress(progress);
      }
    }
  });

  const output = await command.execute();

  if (
    (!output.code && output.stderr.includes("Error")) ||
    output.stderr.includes("Invalid")
  ) {
    throw new Error(output.stderr);
  }
}; 