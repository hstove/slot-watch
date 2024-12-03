import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RecentSigners } from './components/recent-signers/index.tsx';
import { Watcher } from './components/stream/watcher.tsx';
import { BlocksList } from './components/blocks/blocks-list.tsx';
import { ChunkWatcher } from './components/chunk-watcher.tsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: '/stream',
        element: (
          <>
            <ChunkWatcher />
            <Watcher />
          </>
        ),
      },
      {
        path: '/recent-signers',
        element: <RecentSigners />,
      },
      {
        path: '/',
        element: <RecentSigners />,
      },
      {
        path: '/blocks',
        element: <BlocksList />,
      },
    ],
  },
]);

// biome-ignore lint/style/noNonNullAssertion: <explanation>
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
