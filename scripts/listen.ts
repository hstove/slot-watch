const socket = new WebSocket("wss://slot-watch.fly.dev/watch");

socket.addEventListener("message", (event) => {
	console.log(event.data);
});

process.on("SIGINT", () => {
	socket.close();
	process.exit(0);
});
