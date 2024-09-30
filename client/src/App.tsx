import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { Watcher } from "./components/watcher";

function App() {
	// const [count, setCount] = useState(0)

	// return (
	//   <>
	//     <div>
	//       <a href="https://vitejs.dev" target="_blank">
	//         <img src={viteLogo} className="logo" alt="Vite logo" />
	//       </a>
	//       <a href="https://react.dev" target="_blank">
	//         <img src={reactLogo} className="logo react" alt="React logo" />
	//       </a>
	//     </div>
	//     <h1>Vite + React</h1>
	//     <div className="card">
	//       <button onClick={() => setCount((count) => count + 1)}>
	//         count is {count}
	//       </button>
	//       <p>
	//         Edit <code>src/App.tsx</code> and save to test HMR
	//       </p>
	//     </div>
	//     <p className="read-the-docs">
	//       Click on the Vite and React logos to learn more
	//     </p>
	//   </>
	// )

	return (
		<div className="container min-h-screen flex flex-col mx-auto py-10 gap-10">
			{/* header */}
			<header className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Slot watch</h1>
			</header>
			{/* body */}
			<main className="flex-1 flex flex-col w-full">
				{/* <h1 className="text-lg">Hello World</h1> */}
				<Watcher />
			</main>
			{/* footer */}
			{/* <footer className="flex items-center justify-center">
				<h1 className="text-2xl font-bold">Hello World</h1>
			</footer> */}
		</div>
	);
}

export default App;
