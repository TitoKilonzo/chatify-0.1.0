import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { useDiscoverChannels, useJoinChannel } from './useConversations.js';
import styles from './NewGroupDialog.module.css';

export function DiscoverChannelsDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Find channels" size="md">
      <Discover onClose={onClose} />
    </Dialog>
  );
}

function Discover({ onClose }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const channels = useDiscoverChannels(text.trim(), true);
  const join = useJoinChannel();

  function open(channel) {
    join.mutate(channel.id, {
      onSuccess: (conversation) => {
        onClose();
        navigate(`/groups/${conversation.id}`);
      },
    });
  }

  return (
    <div className={styles.form}>
      <Input
        label="Search channels"
        hideLabel
        leadingIcon={Search}
        placeholder="Search channels"
        value={text}
        onChange={(event) => setText(event.target.value)}
        autoComplete="off"
      />
      {join.isError ? <Alert>{join.error.message}</Alert> : null}
      {channels.isError ? <Alert>{channels.error.message}</Alert> : null}
      {channels.data && channels.data.length === 0 ? (
        <p className={styles.heading}>
          {text.trim() ? 'No public channels match.' : 'No public channels to join yet.'}
        </p>
      ) : null}
      <ul className={styles.chips}>
        {(channels.data ?? []).map((channel) => (
          <li key={channel.id} className={styles.chip}>
            <Avatar name={channel.name} src={channel.avatarUrl} kind="group" size="sm" decorative />
            <span className={styles.chipName}>
              {channel.name}
              <span className={styles.heading}>
                {' '}
                {channel.memberCount} {channel.memberCount === 1 ? 'subscriber' : 'subscribers'}
                {channel.description ? ` - ${channel.description}` : ''}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              loading={join.isPending && join.variables === channel.id}
              onClick={() => open(channel)}
            >
              Join
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
