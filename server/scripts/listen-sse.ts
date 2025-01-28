import { EventSource } from 'eventsource';
import { createEventSource } from 'eventsource-client';

const eventSource = createEventSource({
  url: 'https://slot-watch.fly.dev/stream/mainnet',
});

for await (const { data, event, id } of eventSource) {
  console.log({ data, event, id });
}

process.on('SIGINT', () => {
  eventSource.close();
});
