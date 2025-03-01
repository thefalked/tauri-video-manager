import { Command } from "@tauri-apps/plugin-shell";
import { SubtitleTrack, FileWithPath } from "../types";

export const getSubtitleInfo = async (file: FileWithPath): Promise<string> => {
  try {
    const command = Command.create("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "s",
      "-show_entries",
      "stream=index:stream_tags=language,title,handler_name,forced",
      "-of",
      "csv=p=0",
      file.fullPath,
    ]);

    const output = await command.execute();
    if (!output.stdout.trim()) {
      return "No subtitles found";
    }

    const tracks = output.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line, index) => {
        const [_, language, name] = line.split(",");
        return {
          index,
          language: `${language?.trim() || "Unknown language"} (${name?.trim()})`,
        };
      });

    file.subtitleTracks = tracks;

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
    file.fullPath,
  ]);

  const probeOutput = await probeCommand.execute();
  return probeOutput.stdout.trim();
};

export const extractSubtitle = async (
  file: FileWithPath,
  track: SubtitleTrack,
  outputPath: string
): Promise<void> => {
  const command = Command.create("ffmpeg-extract-subtitle", [
    "-i",
    file.fullPath,
    "-map",
    `0:s:${track.index}`,
    "-c:s",
    "srt",
    outputPath,
  ]);

  const output = await command.execute();
  if (output.stderr.includes("Error")) {
    throw new Error(output.stderr);
  }
};

export const isUnsupportedSubtitleCodec = (codec: string): boolean => {
  const unsupportedCodecs = ['hdmv_pgs_subtitle', 'dvd_subtitle'];
  return unsupportedCodecs.includes(codec.toLowerCase());
}; 