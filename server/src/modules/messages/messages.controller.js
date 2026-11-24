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

    async react(req, res) {
      const message = await messagesService.react(
        req.auth.userId,
        req.validated.params.messageId,
        req.validated.body.key,
      );
      res.json({ message });
    },

    async unreact(req, res) {
      res.json({
        message: await messagesService.unreact(req.auth.userId, req.validated.params.messageId),
      });
    },

    async pin(req, res) {
      res.json({
        message: await messagesService.pin(req.auth.userId, req.validated.params.messageId),
      });
    },

    async unpin(req, res) {
      res.json({
        message: await messagesService.unpin(req.auth.userId, req.validated.params.messageId),
      });
    },

    async pins(req, res) {
      const messages = await messagesService.listPins(
        req.auth.userId,
        req.validated.params.conversationId,
      );
      res.json({ messages });
    },

    async forward(req, res) {
      const messages = await messagesService.forward(
        req.auth.userId,
        req.validated.params.messageId,
        req.validated.body.conversationIds,
      );
      res.status(201).json({ messages });
    },

    async search(req, res) {
      res.json(await messagesService.search(req.auth.userId, req.validated.query));
    },

    async sync(req, res) {
      res.json(await messagesService.sync(req.auth.userId, req.validated.query));
    },
  };
}
