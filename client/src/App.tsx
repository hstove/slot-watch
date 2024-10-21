import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { Watcher } from "./components/watcher";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/header";
import { Toaster } from "@/components/ui/toaster";
import { useSearchParams } from "react-router-dom";
import { useHydrateAtoms } from "jotai/utils";
import { getNetwork, networkAtom } from "@/store/network";

function App() {
  const [searchParams] = useSearchParams();
  const networkId = searchParams.get("network");

  useHydrateAtoms([[networkAtom, networkId]]);
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="container min-h-screen flex flex-col mx-auto py-6 gap-6">
        <Header />
        <main className="flex-1 flex flex-col w-full">
          <Watcher />
        </main>
        <Toaster />
        {/* footer */}
        {/* <footer className="flex items-center justify-center">
				<h1 className="text-2xl font-bold">Hello World</h1>
			</footer> */}
      </div>
    </ThemeProvider>
  );
}

export default App;
