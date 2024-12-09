import { Suspense } from 'react';
import './App.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/header';
import { Toaster } from '@/components/ui/toaster';
// import { useSearchParams, Outlet } from 'react-router-dom';
import { useHydrateAtoms } from 'jotai/utils';
import { useAtomsDevtools } from 'jotai-devtools';
import { networkAtom } from '@/store/network';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import { Route as RootRoute } from '@/routes/__root';

function App() {
  const { network } = RootRoute.useLoaderData();
  useAtomsDevtools('slotwatch');

  useHydrateAtoms([[networkAtom, network ?? null]]);
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
        {/* <ChunkWatcher /> */}
        {/* footer */}
        {/* <footer className="flex items-center justify-center">
				<h1 className="text-2xl font-bold">Hello World</h1>
			</footer> */}
      </div>
      <TanStackRouterDevtools />
    </ThemeProvider>
  );
}

export default App;
