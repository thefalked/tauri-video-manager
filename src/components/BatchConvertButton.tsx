import { RefreshCw, Loader } from "lucide-react";
import { useFileContext } from "../context/FileContext";

export const BatchConvertButton = () => {
  const { selectedFiles, isBatchConverting, handleBatchConvert } =
    useFileContext();

  if (selectedFiles.size === 0) return null;

  return (
    <button
      onClick={handleBatchConvert}
      disabled={isBatchConverting}
      className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
    >
      {isBatchConverting ? (
        <>
          <Loader className="w-4 h-4 animate-spin" />
          <span className="text-sm">Converting...</span>
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm">Convert {selectedFiles.size} Selected</span>
        </>
      )}
    </button>
  );
};
