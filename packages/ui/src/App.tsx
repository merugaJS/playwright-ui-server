import { Header } from './components/layout/Header.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { MainContent } from './components/layout/MainContent.js';
import { useWebSocket } from './api/useWebSocket.js';
import { ToastContainer } from './components/ui/Toast.js';
import { ErrorBoundary } from './components/ui/ErrorBoundary.js';

export default function App() {
  useWebSocket();

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ErrorBoundary>
          <MainContent />
        </ErrorBoundary>
      </div>
      <ToastContainer />
    </div>
  );
}
