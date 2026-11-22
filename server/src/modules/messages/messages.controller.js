export function createMessagesController({ messagesService }) {
  return {
    async list(req, res) {
      const { conversationId } = req.validated.params;
      const { before, limit } = req.validated.query;
      res.json(await messagesService.list(req.auth.userId, conversationId, { before, limit }));
    },

    async send(req, res) {
      const { conversationId } = req.validated.params;
      const { message, duplicate } = await messagesService.send(
        req.auth.userId,
        conversationId,
        req.validated.body,
      );
      res.status(duplicate ? 200 : 201).json({ message });
    },

    async markRead(req, res) {
      const { conversationId } = req.validated.params;
      res.json(
        await messagesService.markRead(
          req.auth.userId,
          conversationId,
          req.validated.body.upToMessageId,
        ),
      );
    },

    async edit(req, res) {
      const message = await messagesService.edit(
        req.auth.userId,
        req.validated.params.messageId,
        req.validated.body.body,
      );
      res.json({ message });
    },

    async remove(req, res) {
      await messagesService.remove(req.auth.userId, req.validated.params.messageId);
      res.status(204).end();
    },

    async sync(req, res) {
      res.json(await messagesService.sync(req.auth.userId, req.validated.query));
    },
  };
}
