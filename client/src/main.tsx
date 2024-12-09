import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {
  createBrowserRouter,
  RouterProvider as RRRouteProvider,
} from 'react-router-dom';
import { RecentSigners } from './components/recent-signers/index.tsx';
import { Watcher } from './components/stream/watcher.tsx';
import { BlocksList } from './components/blocks/blocks-list.tsx';
import { ChunkWatcher } from './components/chunk-watcher.tsx';
import { WhenExtend } from './components/extend/when-extend.tsx';
import { routeTree } from './routeTree.gen.ts';
import { RouterProvider, createRouter } from '@tanstack/react-router';

const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rrrouter = createBrowserRouter([
  {
    path: '/v1',
    element: <App />,
    children: [
      {
        path: './stream',
        element: (
          <>
            <ChunkWatcher />
            <Watcher />
          </>
        ),
      },
      {
        path: './recent-signers',
        element: <RecentSigners />,
      },
      {
        path: './',
        element: <RecentSigners />,
      },
      {
        path: './blocks',
        element: <BlocksList />,
      },
      {
        path: './extend',
        element: <WhenExtend />,
      },
    ],
  },
]);

// biome-ignore lint/style/noNonNullAssertion: <explanation>
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* <RRRouteProvider router={rrrouter} /> */}
    <RouterProvider router={router} />
  </StrictMode>,
);
