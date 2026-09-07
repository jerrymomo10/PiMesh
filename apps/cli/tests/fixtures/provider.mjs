import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

// Use the installed Pi runtime, replacing only model inference. No network or real key.
const coreRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))));
const { createAssistantMessageEventStream } = await import(pathToFileURL(join(coreRoot,
  'node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js')));

export default function fixture(pi) {
  pi.registerProvider('meshpi-test', {
    api: 'meshpi-fixture',
    apiKey: 'synthetic-test-only',
    baseUrl: 'http://unused.invalid',
    models: [{
      id: 'fixture', name: 'Offline fixture', reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000, maxTokens: 4096,
    }],
    streamSimple(model, context) {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const last = context.messages.at(-1);
        const toolDone = last?.role === 'toolResult';
        const output = {
          role: 'assistant', api: model.api, provider: model.provider, model: model.id,
          content: toolDone
            ? [{ type: 'text', text: 'Fixture complete: 工具结果已记录。' }]
            : [{ type: 'toolCall', id: `call-${Date.now()}`, name: 'read', arguments: { path: 'evidence.txt' } }],
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: toolDone ? 'stop' : 'toolUse', timestamp: Date.now(),
        };
        stream.push({ type: 'start', partial: output });
        if (toolDone) stream.push({ type: 'text_delta', contentIndex: 0, delta: output.content[0].text, partial: output });
        stream.push({ type: 'done', reason: output.stopReason, message: output });
      });
      return stream;
    },
  });
}
