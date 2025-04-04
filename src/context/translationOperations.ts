import { Ollama } from "ollama";
import { ollamaModel, prompt } from "./constants";

interface SubtitleEntry {
  index: number;
  timestamp: string;
  text: string[];
  translation?: string[];
}

interface TranslationEntry {
  index: number;
  lines: string[];
}

interface TranslationResponse {
  translations: TranslationEntry[];
}

const ollama = new Ollama({ host: "http://localhost:11434" });

export const checkOllamaServer = async (): Promise<boolean> => {
  try {
    await ollama.list();
    return true;
  } catch (error) {
    return false;
  }
};

export const retryWithBackoff = async <T,>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  retryCount: number = 0
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    if (retryCount >= maxRetries) {
      throw error;
    }

    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    await new Promise((resolve) => setTimeout(resolve, delay));

    return retryWithBackoff(operation, maxRetries, retryCount + 1);
  }
};

export const parseSubtitleContent = (content: string): SubtitleEntry[] => {
  const chunks = content.split("\n\n");
  const subtitleEntries: SubtitleEntry[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    if (lines.length < 3) continue;

    const index = parseInt(lines[0]);
    const timestamp = lines[1];
    const text = lines.slice(2);

    subtitleEntries.push({
      index,
      timestamp,
      text,
    });
  }

  return subtitleEntries;
};

export const translateBatch = async (
  entries: SubtitleEntry[],
  batchNumber: number
): Promise<TranslationResponse> => {
  const entriesToTranslate = entries.map((entry) => ({
    index: entry.index,
    lines: entry.text,
  }));

  console.log("Input:", {
    entries: entriesToTranslate,
    totalEntries: entriesToTranslate.length,
  });

  let attempts = 0;
  const maxAttempts = 3; // Prevent infinite loops in case of persistent issues

  while (attempts < maxAttempts) {
    try {
      let fullResponse = "";
      const promptWithEntries = prompt.concat(JSON.stringify({ entries: entriesToTranslate }));
      console.log("Full prompt:", promptWithEntries);

      const stream = await ollama.generate({
        model: ollamaModel,
        prompt: promptWithEntries,
        stream: true,
        options: {
          stop: ["</INST>", "[/INST]"],
          seed: 42 + attempts // Vary the seed for each attempt
        }
      });

      for await (const chunk of stream) {
        fullResponse += chunk.response;
      }

      if (!fullResponse) {
        throw new Error(`Empty response received for batch ${batchNumber}`);
      }

      console.log("Full response:", fullResponse);

      const withoutThinkTag = fullResponse.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      const jsonMatch = withoutThinkTag.match(/```json\s*([\s\S]*?)\s*```/);

      const jsonContent = jsonMatch ? jsonMatch[1].trim() : withoutThinkTag;
      console.log("JSON content:", jsonContent);

      try {
        const parsedResponse = JSON.parse(jsonContent) as TranslationResponse;

        // Check if we have the same number of translations as entries
        if (!parsedResponse.translations || parsedResponse.translations.length !== entriesToTranslate.length) {
          console.log("Translation count mismatch:", {
            expected: entriesToTranslate.length,
            received: parsedResponse.translations?.length || 0
          });

          // Find the last successfully translated index
          const translatedIndices = new Set(parsedResponse.translations?.map(t => t.index) || []);
          const lastTranslatedIndex = Math.max(...translatedIndices, 0);

          // Get the remaining entries to translate, maintaining the full SubtitleEntry structure
          const remainingEntries = entries.filter(entry => entry.index > lastTranslatedIndex);

          if (remainingEntries.length > 0) {
            console.log("Retrying remaining entries:", remainingEntries);
            // Recursively translate the remaining entries
            const remainingTranslations = await translateBatch(remainingEntries, batchNumber);
            // Combine the successful translations with the new ones
            return {
              translations: [
                ...(parsedResponse.translations || []),
                ...remainingTranslations.translations
              ]
            };
          }

          attempts++;
          continue;
        }

        return parsedResponse;
      } catch (error) {
        console.log("JSON parsing error:", error);
        attempts++;
        continue; // Retry the translation with incremented attempt counter
      }
    } catch (error: any) {
      // Only retry for API or parsing errors
      if (error.message === "No JSON found in response" || error.message === "Invalid JSON response") {
        console.log("Retrying due to invalid response format");
        attempts++;
        continue; // Retry the translation with incremented attempt counter
      }
      throw error;
    }
  }

  // If we've exhausted all attempts, throw an error
  throw new Error(`Failed to translate batch ${batchNumber} after ${maxAttempts} attempts`);
};

export const updateEntriesWithTranslations = (
  entries: SubtitleEntry[],
  translations: TranslationResponse["translations"]
): void => {
  const translationsMap = new Map(
    translations.map((t) => [t.index, t.lines])
  );

  for (const entry of entries) {
    const translation = translationsMap.get(entry.index);
    if (!translation) {
      throw new Error(`Missing translation for entry ${entry.index}`);
    }
    entry.translation = translation;
  }
};

export const formatTranslatedContent = (entries: SubtitleEntry[]): string => {
  return entries
    .map(
      (entry) =>
        `${entry.index}\n${entry.timestamp}\n${entry.translation?.join("\n") || entry.text.join("\n")
        }\n`
    )
    .join("\n");
}; 