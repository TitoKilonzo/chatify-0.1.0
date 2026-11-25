export function createConversationsController({ conversationsService }) {
  return {
    async list(req, res) {
      res.json({ conversations: await conversationsService.list(req.auth.userId) });
    },

    async get(req, res) {
      res.json({
        conversation: await conversationsService.get(
          req.auth.userId,
          req.validated.params.conversationId,
        ),
      });
    },

    async openDirect(req, res) {
      const { conversation, created } = await conversationsService.openDirect(
        req.auth.userId,
        req.validated.body.userId,
      );
      res.status(created ? 201 : 200).json({ conversation });
    },

    async createGroup(req, res) {
      const conversation = await conversationsService.createGroup(
        req.auth.userId,
        req.validated.body,
      );
      res.status(201).json({ conversation });
    },

    async rename(req, res) {
      const conversation = await conversationsService.rename(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.body.name,
      );
      res.json({ conversation });
    },

    async setEncryption(req, res) {
      const conversation = await conversationsService.setEncryption(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.body.enabled,
      );
      res.json({ conversation });
    },

    async setDisappearing(req, res) {
      const conversation = await conversationsService.setDisappearing(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.body.seconds,
      );
      res.json({ conversation });
    },

    async addMembers(req, res) {
      const conversation = await conversationsService.addMembers(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.body.userIds,
      );
      res.json({ conversation });
    },

    async removeMember(req, res) {
      const { conversationId, userId } = req.validated.params;
      const conversation = await conversationsService.removeMember(
        req.auth.userId,
        conversationId,
        userId,
      );
      res.json({ conversation });
    },

    async setRole(req, res) {
      const { conversationId, userId } = req.validated.params;
      const conversation = await conversationsService.setRole(
        req.auth.userId,
        conversationId,
        userId,
        req.validated.body.role,
      );
      res.json({ conversation });
    },

    async leave(req, res) {
      await conversationsService.leave(req.auth.userId, req.validated.params.conversationId);
      res.status(204).end();
    },

    async setPreferences(req, res) {
      const conversation = await conversationsService.setPreferences(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.body,
      );
      res.json({ conversation });
    },
  };
}
