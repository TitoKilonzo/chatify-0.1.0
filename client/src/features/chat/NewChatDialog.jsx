import { useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { useOpenDirect } from './useConversations.js';
import { UserPicker } from './UserPicker.jsx';

/** Start (or reopen) a direct conversation with someone found in the directory. */
export function NewChatDialog({ open, onClose }) {
  const navigate = useNavigate();
  const openDirect = useOpenDirect();

  function choose(user) {
    openDirect.mutate(user.id, {
      onSuccess: (conversation) => {
        onClose();
        navigate(`/chats/${conversation.id}`);
      },
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="New message">
      {openDirect.isError ? <Alert>{openDirect.error.message}</Alert> : null}
      <UserPicker onSelect={choose} disabled={openDirect.isPending} />
    </Dialog>
  );
}
