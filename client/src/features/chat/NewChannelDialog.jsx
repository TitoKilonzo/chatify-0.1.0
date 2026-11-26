import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { fieldErrorsFrom } from '../auth/validation.js';
import { useCreateChannel } from './useConversations.js';
import styles from './NewGroupDialog.module.css';

export function NewChannelDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="New channel" size="md">
      <ChannelForm onClose={onClose} />
    </Dialog>
  );
}

// Mounted only while the dialog is open, so its state resets every time.
function ChannelForm({ onClose }) {
  const navigate = useNavigate();
  const create = useCreateChannel();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState(null);
  const serverErrors = fieldErrorsFrom(create.error);

  function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give the channel a name');
      return;
    }
    setError(null);
    create.mutate(
      { name: name.trim(), description: description.trim(), isPublic },
      {
        onSuccess: (conversation) => {
          onClose();
          navigate(`/groups/${conversation.id}`);
        },
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {create.isError && Object.keys(serverErrors).length === 0 ? (
        <Alert>{create.error.message}</Alert>
      ) : null}
      <Input
        label="Channel name"
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        error={error ?? serverErrors.name}
        autoComplete="off"
      />
      <Input
        label="Description (optional)"
        value={description}
        maxLength={300}
        onChange={(event) => setDescription(event.target.value)}
        error={serverErrors.description}
        autoComplete="off"
      />
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
        />
        <span>Anyone can find and join this channel</span>
      </label>
      <p className={styles.heading}>
        Only you and the admins you choose can post. Everyone else reads and reacts.
      </p>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Create channel
        </Button>
      </div>
    </form>
  );
}
