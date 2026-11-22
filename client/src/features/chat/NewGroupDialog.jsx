import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { fieldErrorsFrom } from '../auth/validation.js';
import { useCreateGroup } from './useConversations.js';
import { UserPicker } from './UserPicker.jsx';
import styles from './NewGroupDialog.module.css';

const NAME_MAX = 60;

export function NewGroupDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="New group" size="md">
      <GroupForm onClose={onClose} />
    </Dialog>
  );
}

// Mounted only while the dialog is open, so its state resets every time.
function GroupForm({ onClose }) {
  const navigate = useNavigate();
  const create = useCreateGroup();
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const serverErrors = fieldErrorsFrom(create.error);

  function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError({ name: 'Give the group a name' });
      return;
    }
    if (members.length === 0) {
      setError({ members: 'Add at least one person' });
      return;
    }
    setError(null);
    create.mutate(
      { name: name.trim(), memberIds: members.map((member) => member.id) },
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
        label="Group name"
        value={name}
        maxLength={NAME_MAX}
        onChange={(event) => setName(event.target.value)}
        error={error?.name ?? serverErrors.name}
        autoComplete="off"
      />

      <div>
        <p className={styles.heading}>Members ({members.length})</p>
        {members.length > 0 ? (
          <ul className={styles.chips}>
            {members.map((member) => (
              <li key={member.id} className={styles.chip}>
                <Avatar name={member.displayName} src={member.avatarUrl} size="sm" decorative />
                <span className={styles.chipName}>{member.displayName}</span>
                <IconButton
                  label={`Remove ${member.displayName}`}
                  icon={X}
                  size="sm"
                  onClick={() => setMembers((list) => list.filter((m) => m.id !== member.id))}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {error?.members ? (
          <p className={styles.error} role="alert">
            {error.members}
          </p>
        ) : null}
      </div>

      <UserPicker
        label="Add people"
        excludeIds={members.map((member) => member.id)}
        onSelect={(user) => setMembers((list) => [...list, user])}
      />

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Create group
        </Button>
      </div>
    </form>
  );
}
