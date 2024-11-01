import { getPayloadId, type WSPayload } from 'slot-watch-common';

const socket = new WebSocket('wss://slot-watch.fly.dev/watch');

socket.addEventListener('message', (event) => {
  const payload = JSON.parse(event.data) as WSPayload;
  console.log(getPayloadId(payload), payload.networkKey);
});

process.on('SIGINT', () => {
  socket.close();
  process.exit(0);
});
