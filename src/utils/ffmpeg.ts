import { Command } from "@tauri-apps/plugin-shell";
import { SubtitleTrack, FileWithPath } from "../types";

export const getSubtitleInfo = async (file: FileWithPath): Promise<string> => {
  try {
    const command = Command.create("ffprobe-subtitle", [
      "-v",
      "error",
      "-select_streams",
      "s",
      "-show_entries",
      "stream=index:stream_tags=language",
      "-of",
      "csv=p=1",
      "-i",
      file.fullPath,
    ]);

    const output = await command.execute();
    const tracks = output.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line, index) => {
        const [_, language] = line.split(",");
        return {
          index,
          language: language || "Unknown language",
        };
      });

    const subtitles = tracks
      .map((track) => `Track ${track.index}: ${track.language}`)
      .join("\n");

    return `Available Subtitles:\n${subtitles}`;
  } catch (error) {
    console.error("Error getting subtitle info:", error);
    return "Error getting subtitle info";
  }
};

export const getSubtitleCodec = async (
  file: FileWithPath,
  track: SubtitleTrack
): Promise<string> => {
  const probeCommand = Command.create("ffprobe-codec", [
    "-v",
    "error",
    "-select_streams",
    `s:${track.index}`,
    "-show_entries",
    "stream=codec_name",
    "-of",
    "csv=p=0",
    "-i",
    file.fullPath,
  ]);

  const probeOutput = await probeCommand.execute();
  return probeOutput.stdout.trim();
};

export const extractBitmapSubtitle = async (
  file: FileWithPath,
  track: SubtitleTrack,
  outputPath: string
): Promise<void> => {
  const command = Command.create("ffmpeg-extract-bitmap-subtitle", [
    "-i",
    file.fullPath,
    "-map",
    `0:s:${track.index}`,
    "-filter:s",
    "tesseract=lang=eng",
    "-f",
    "srt",
    outputPath,
  ]);

  const output = await command.execute();
  if (output.stderr.includes("Error")) {
    throw new Error(output.stderr);
  }
};

export const extractTextSubtitle = async (
  file: FileWithPath,
  track: SubtitleTrack,
  outputPath: string
): Promise<void> => {
  const command = Command.create("ffmpeg-extract-subtitle", [
    "-i",
    file.fullPath,
    "-map",
    `0:s:${track.index}`,
    "-f",
    "srt",
    outputPath,
  ]);

  const output = await command.execute();
  if (output.stderr.includes("Error")) {
    throw new Error(output.stderr);
  }
}; 