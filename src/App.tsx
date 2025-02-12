import { FileProvider } from "./context/FileContext";
import { Header } from "./components/Header";
import { BatchConvertButton } from "./components/BatchConvertButton";
import { FileExplorer } from "./components/FileExplorer";
import { Toaster } from "./components/Toaster";
import "./App.css";

const AppContent = () => {
  return (
    <main className="container mx-auto px-4 py-6 max-w-4xl bg-gray-900 min-h-screen text-gray-100">
      <Header />
      <div className="space-y-4">
        <div className="flex justify-end">
          <BatchConvertButton />
        </div>
        <FileExplorer />
      </div>
    </main>
  );
};

export function App() {
  return (
    <FileProvider>
      <Toaster />
      <AppContent />
    </FileProvider>
  );
}
