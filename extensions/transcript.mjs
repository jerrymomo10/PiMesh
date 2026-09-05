import { preparePaths, resolvePaths } from '../src/paths.mjs';
import { createTranscript } from '../src/transcript.mjs';

export const transcriptEvents = [
  'input', 'before_agent_start', 'agent_start', 'agent_end', 'agent_settled',
  'turn_start', 'turn_end', 'message_start', 'message_update', 'message_end',
  'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
  'session_before_switch', 'session_before_fork',
  'session_before_compact', 'session_compact', 'session_before_tree', 'session_tree',
  'session_info_changed', 'model_select', 'thinking_level_select', 'user_bash',
];

export default function transcriptExtension(pi) {
  let writer;
  function save(event, ctx, snapshot = false) {
    try {
      if (!writer) {
        const paths = resolvePaths(ctx.cwd);
        preparePaths(paths);
        writer = createTranscript(paths.transcriptDir, {
          workspace: paths.workspace, workspaceId: paths.workspaceId,
          pid: process.pid,
        });
      }
      const context = {
        sessionId: ctx.sessionManager.getSessionId(),
        sessionFile: ctx.sessionManager.getSessionFile(),
        workspace: ctx.cwd,
      };
      // Streaming updates contain a growing message snapshot. Store the provider delta
      // without its redundant partial snapshot; message_end preserves the final message.
      let payload = event;
      if (event.type === 'message_update') {
        const { partial, ...delta } = event.assistantMessageEvent;
        payload = { type: event.type, assistantMessageEvent: delta };
      }
      writer.append(payload, context);
      if (snapshot) {
        writer.append({
          type: 'session_snapshot',
          header: ctx.sessionManager.getHeader(),
          entries: ctx.sessionManager.getEntries(),
        }, context);
      }
    } catch (error) {
      // Pi normally catches extension errors and continues. Recording is mandatory here.
      process.stderr.write(`meshpi: Transcript could not be saved: ${error.message}\n`);
      process.exit(1);
    }
  }
  pi.on('session_start', (event, ctx) => save(event, ctx, true));
  for (const name of transcriptEvents) {
    pi.on(name, (event, ctx) => save(event, ctx,
      ['session_compact', 'session_tree', 'agent_settled', 'session_info_changed'].includes(name)));
  }
  pi.on('session_shutdown', (event, ctx) => {
    save(event, ctx, true);
    writer?.close();
    writer = undefined;
  });
}
