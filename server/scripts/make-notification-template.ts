import { knownSigners } from 'slot-watch-common';

const lines: string[] = [];

for (const [key, signer] of Object.entries(knownSigners)) {
  const isStart = lines.length === 0;
  const iffy = `{{- ${isStart ? 'if' : 'else if'} eq . "${key}" -}}`;
  lines.push(iffy);
  lines.push(signer);
}

lines.push('{{- end -}}');

console.log(lines.join('\n'));
