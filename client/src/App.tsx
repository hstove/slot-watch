import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { Watcher } from "./components/watcher";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/header";
import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="container min-h-screen flex flex-col mx-auto py-6 gap-6">
        {/* header */}
        <Header />
        {/* body */}
        <main className="flex-1 flex flex-col w-full">
          {/* <h1 className="text-lg">Hello World</h1> */}
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
