import { Suspense } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/header';
import { Toaster } from '@/components/ui/toaster';
import { useHydrateAtoms } from 'jotai/utils';
import { useAtomsDevtools } from 'jotai-devtools';
import { networkAtom } from '@/store/network';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Outlet } from '@tanstack/react-router';
import { Route as RootRoute } from '@/routes/__root';
import React from 'react';
import { useSetAtom } from 'jotai';
import { Footer } from './components/footer';

const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null // Render nothing in production
  : React.lazy(() =>
      // Lazy load in development
      import('@tanstack/router-devtools').then((res) => ({
        default: res.TanStackRouterDevtools,
        // For Embedded Mode
        // default: res.TanStackRouterDevtoolsPanel
      }))
    );

function App() {
  const { network } = RootRoute.useLoaderData();
  const setNetwork = useSetAtom(networkAtom);
  useAtomsDevtools('slotwatch');

  React.useEffect(() => {
    setNetwork(network ?? null);
  }, [network, setNetwork]);

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
          <Footer />
        </main>
        <Toaster />
        {/* <ChunkWatcher /> */}
        {/* footer */}
        {/* <footer className="flex items-center justify-center">
				<h1 className="text-2xl font-bold">Hello World</h1>
			</footer> */}
      </div>
      <React.Suspense>
        <TanStackRouterDevtools />
      </React.Suspense>
    </ThemeProvider>
  );
}

export default App;
