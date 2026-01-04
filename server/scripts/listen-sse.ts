import { createEventSource } from 'eventsource-client';

const eventSource = createEventSource({
  url: 'https://slot-watch.fly.dev/stream/testnet',
});

for await (const { data, event: _event, id: _id } of eventSource) {
  console.log(JSON.parse(data));
}

process.on('SIGINT', () => {
  eventSource.close();
});
