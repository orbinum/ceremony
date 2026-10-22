/** Answers with exactly the message it is told to send, bypassing `serveOnce`'s reply shape. */
process.once("message", (message: { task: { reply: unknown } }) => {
  process.send?.(message.task.reply);
});
