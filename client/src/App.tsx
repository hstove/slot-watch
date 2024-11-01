import { Suspense } from 'react';
import './App.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/header';
import { Toaster } from '@/components/ui/toaster';
import { useSearchParams, Outlet } from 'react-router-dom';
import { useHydrateAtoms } from 'jotai/utils';
import { useAtomsDevtools } from 'jotai-devtools';
import { networkAtom } from '@/store/network';
import { ReloadIcon } from '@radix-ui/react-icons';
import { useChunksWatcher } from './hooks/use-websocket';

function ChunkWatcher() {
  useChunksWatcher();
  return null;
}

function App() {
  const [searchParams] = useSearchParams();
  const networkId = searchParams.get('network');
  useAtomsDevtools('slotwatch');

  useHydrateAtoms([[networkAtom, networkId]]);
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="container min-h-screen flex flex-col mx-auto py-6 gap-6">
        <Header />
        <main className="flex-1 flex flex-col w-full">
          {/* <Watcher /> */}
          {/* <Outlet /> */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center">
                <ReloadIcon className="animate-spin w-10 h-10" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        <Toaster />
        <ChunkWatcher />
        {/* footer */}
        {/* <footer className="flex items-center justify-center">
				<h1 className="text-2xl font-bold">Hello World</h1>
			</footer> */}
      </div>
    </ThemeProvider>
  );
}

export default App;
