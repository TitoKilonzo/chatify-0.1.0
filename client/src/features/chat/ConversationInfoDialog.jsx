import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Bell, BellOff, Camera, Ellipsis, LogOut } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Menu } from '../../components/ui/Menu.jsx';
import { api } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';
import { formatMessageTime } from '../../lib/date.js';
import { formatLastSeen } from '../../lib/date.js';
import { effectivePresence, usePresenceStore } from '../../stores/liveStores.js';
import {
  useAddMembers,
  useGroupAvatar,
  useLeaveGroup,
  useRemoveMember,
  useRenameGroup,
  useSetPreferences,
  useSetRole,
  useUpdateChannel,
} from './useConversations.js';
import { DisappearingSetting } from './DisappearingSetting.jsx';
import { EncryptionSetting } from './EncryptionSetting.jsx';
import { UserPicker } from './UserPicker.jsx';
import styles from './ConversationInfoDialog.module.css';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };

export function ConversationInfoDialog({ open, onClose, conversation, meId, section }) {
  return (
    <Dialog open={open} onClose={onClose} title="Details" size="lg">
      <Details conversation={conversation} meId={meId} section={section} onClose={onClose} />
    </Dialog>
  );
}

function Details({ conversation, meId, section, onClose }) {
  const isGroup = conversation.type === 'group';
  const preferences = useSetPreferences();

  return (
    <div className={styles.details}>
      {isGroup ? (
        <GroupHeader conversation={conversation} />
      ) : (
        <PersonHeader user={conversation.counterpart} />
      )}

      <div className={styles.toggles}>
        <Button
          leadingIcon={conversation.muted ? Bell : BellOff}
          onClick={() => preferences.mutate({ id: conversation.id, muted: !conversation.muted })}
        >
          {conversation.muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button
          leadingIcon={conversation.archived ? ArchiveRestore : Archive}
          onClick={() =>
            preferences.mutate({ id: conversation.id, archived: !conversation.archived })
          }
        >
          {conversation.archived ? 'Unarchive' : 'Archive'}
        </Button>
      </div>

      {conversation.channel && conversation.role !== 'member' ? (
        <ChannelSettings conversation={conversation} />
      ) : null}

      <DisappearingSetting conversation={conversation} />

      {isGroup ? null : <EncryptionSetting conversation={conversation} />}

      <SharedMedia conversationId={conversation.id} />

      {isGroup ? (
        <GroupManagement
          conversation={conversation}
          meId={meId}
          section={section}
          onLeft={onClose}
        />
      ) : null}
    </div>
  );
}

function PersonHeader({ user }) {
  const live = usePresenceStore((state) => state.byUser);
  const presence = effectivePresence(user, live);
  return (
    <div className={styles.hero}>
      <Avatar name={user.displayName} src={user.avatarUrl} size="lg" status={presence.status} />
      <div>
        <h3 className={styles.name}>{user.displayName}</h3>
        <p className={styles.muted}>@{user.username}</p>
        <p className={styles.muted}>
          {presence.status === 'online' ? 'Online' : formatLastSeen(presence.lastSeenAt)}
        </p>
      </div>
    </div>
  );
}

function SharedMedia({ conversationId }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['conversation-media', conversationId],
    queryFn: async () => (await api.get(`/conversations/${conversationId}/media`)).media,
    refetchOnMount: 'always',
  });

  return (
    <section className={styles.section} aria-labelledby="shared-media-heading">
      <h3 id="shared-media-heading" className={styles.sectionTitle}>
        Shared media and files
      </h3>
      {isPending ? <p className={styles.muted}>Loading shared files...</p> : null}
      {isError ? <Alert>{error.message}</Alert> : null}
      {!isPending && !isError && data?.length === 0 ? (
        <p className={styles.muted}>Photos, videos, voice notes, and files will appear here.</p>
      ) : null}
      {data?.length ? (
        <ul className={styles.mediaGrid}>
          {data.map(({ attachment, createdAt }) => (
            <li key={attachment.id} className={styles.mediaItem}>
              {attachment.mimeType.startsWith('image/') ? (
                <a
                  className={styles.mediaPreview}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${attachment.name}`}
                >
                  <img
                    src={attachment.thumbnailUrl ?? attachment.url}
                    alt={attachment.name}
                    loading="lazy"
                  />
                </a>
              ) : attachment.mimeType.startsWith('video/') ? (
                // This gallery cannot provide a caption track for user-uploaded videos.
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  className={styles.mediaPreview}
                  src={attachment.url}
                  controls
                  preload="metadata"
                  aria-label={attachment.name}
                />
              ) : attachment.mimeType.startsWith('audio/') ? (
                <audio src={attachment.url} controls aria-label={attachment.name} />
              ) : (
                <a className={styles.mediaFile} href={attachment.url} download={attachment.name}>
                  {attachment.name}
                </a>
              )}
              <span className={styles.mediaName}>{attachment.name}</span>
              <span className={styles.muted}>
                {formatBytes(attachment.sizeBytes)} | {formatMessageTime(createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Description and visibility of a channel, for its owner and admins. */
function ChannelSettings({ conversation }) {
  const update = useUpdateChannel(conversation.id);
  const [description, setDescription] = useState(conversation.description ?? '');
  const changed = description.trim() !== (conversation.description ?? '');

  return (
    <section className={styles.section} aria-labelledby="channel-heading">
      <h3 id="channel-heading" className={styles.sectionTitle}>
        Channel settings
      </h3>
      <Input
        label="Description"
        value={description}
        maxLength={300}
        onChange={(event) => setDescription(event.target.value)}
        autoComplete="off"
      />
      <div className={styles.toggles}>
        <Button
          variant="secondary"
          disabled={!changed}
          loading={update.isPending}
          onClick={() => update.mutate({ description: description.trim() })}
        >
          Save description
        </Button>
        <Button
          variant="secondary"
          loading={update.isPending}
          onClick={() => update.mutate({ isPublic: !conversation.isPublic })}
        >
          {conversation.isPublic ? 'Make private' : 'Make public'}
        </Button>
      </div>
      <p className={styles.muted}>
        {conversation.isPublic
          ? 'Anyone can find and join this channel.'
          : 'Only people you add can join this channel.'}
      </p>
      {update.isError ? <Alert>{update.error.message}</Alert> : null}
    </section>
  );
}

function GroupHeader({ conversation }) {
  const rename = useRenameGroup(conversation.id);
  const avatar = useGroupAvatar(conversation.id);
  const fileRef = useRef(null);
  const [name, setName] = useState(conversation.name ?? '');
  const canManage = conversation.role !== 'member';
  const error = rename.error ?? avatar.upload.error ?? avatar.remove.error;

  return (
    <div className={styles.groupHeader}>
      <div className={styles.hero}>
        <Avatar
          name={conversation.name}
          src={conversation.avatarUrl}
          kind="group"
          size="lg"
          decorative
        />
        <div>
          <h3 className={styles.name}>{conversation.name}</h3>
          <p className={styles.muted}>
            {conversation.memberCount} {conversation.channel ? 'subscribers' : 'members'}
          </p>
          {conversation.description ? <p>{conversation.description}</p> : null}
        </div>
        {canManage ? (
          <div className={styles.heroActions}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  avatar.upload.mutate(file);
                }
                event.target.value = '';
              }}
            />
            <Button
              size="sm"
              leadingIcon={Camera}
              loading={avatar.upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              Change photo
            </Button>
            {conversation.avatarUrl ? (
              <Button
                size="sm"
                variant="ghost"
                loading={avatar.remove.isPending}
                onClick={() => avatar.remove.mutate()}
              >
                Remove photo
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <Alert>{error.message}</Alert> : null}

      {canManage ? (
        <form
          className={styles.renameForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && name.trim() !== conversation.name) {
              rename.mutate(name.trim());
            }
          }}
        >
          <Input
            label="Group name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
          <Button
            type="submit"
            loading={rename.isPending}
            disabled={!name.trim() || name.trim() === conversation.name}
          >
            Rename
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function GroupManagement({ conversation, meId, section, onLeft }) {
  const navigate = useNavigate();
  const addMembers = useAddMembers(conversation.id);
  const removeMember = useRemoveMember(conversation.id);
  const setRole = useSetRole(conversation.id);
  const leave = useLeaveGroup(conversation.id);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const live = usePresenceStore((state) => state.byUser);
  const myRole = conversation.role;
  const canManage = myRole !== 'member';
  const failure = addMembers.error ?? removeMember.error ?? setRole.error;

  function memberActions(member) {
    if (member.id === meId || member.role === 'owner') {
      return [];
    }
    const actions = [];
    if (myRole === 'owner') {
      actions.push({
        id: 'role',
        label: member.role === 'admin' ? 'Remove admin' : 'Make admin',
        onSelect: () =>
          setRole.mutate({ userId: member.id, role: member.role === 'admin' ? 'member' : 'admin' }),
      });
    }
    if (myRole === 'owner' || (myRole === 'admin' && member.role === 'member')) {
      actions.push({
        id: 'remove',
        label: 'Remove from group',
        onSelect: () => removeMember.mutate(member.id),
      });
    }
    return actions;
  }

  return (
    <>
      {failure ? <Alert>{failure.message}</Alert> : null}

      <section aria-labelledby="members-heading">
        <h3 id="members-heading" className={styles.sectionTitle}>
          {conversation.channel
            ? conversation.role === 'member'
              ? 'Admins'
              : `Subscribers and admins (${conversation.memberCount})`
            : `Members (${conversation.members.length})`}
        </h3>
        <ul className={styles.members}>
          {conversation.members.map((member) => {
            const actions = memberActions(member);
            const presence = effectivePresence(member, live);
            return (
              <li key={member.id} className={styles.member}>
                <Avatar
                  name={member.displayName}
                  src={member.avatarUrl}
                  size="sm"
                  status={presence.status}
                  decorative
                />
                <span className={styles.memberText}>
                  <span className={styles.memberName}>
                    {member.displayName}
                    {member.id === meId ? ' (you)' : ''}
                  </span>
                  <span className={styles.muted}>@{member.username}</span>
                </span>
                <span className={styles.role}>{ROLE_LABEL[member.role]}</span>
                {actions.length > 0 ? (
                  <Menu
                    label={`Actions for ${member.displayName}`}
                    items={actions}
                    placement="bottom-end"
                    trigger={(props) => (
                      <IconButton
                        label={`Actions for ${member.displayName}`}
                        icon={Ellipsis}
                        size="sm"
                        {...props}
                      />
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {canManage ? (
        <section aria-labelledby="add-heading">
          <h3 id="add-heading" className={styles.sectionTitle}>
            Add people
          </h3>
          <UserPicker
            label="Search people to add"
            excludeIds={conversation.members.map((member) => member.id)}
            disabled={addMembers.isPending}
            onSelect={(user) => addMembers.mutate([user.id])}
          />
        </section>
      ) : null}

      <div className={styles.leave}>
        <Button leadingIcon={LogOut} onClick={() => setConfirmingLeave(true)}>
          {conversation.channel ? 'Leave channel' : 'Leave group'}
        </Button>
      </div>

      <Dialog
        open={confirmingLeave}
        onClose={() => setConfirmingLeave(false)}
        title={conversation.channel ? 'Leave this channel?' : 'Leave this group?'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingLeave(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={leave.isPending}
              onClick={() =>
                leave.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmingLeave(false);
                    onLeft();
                    navigate(`/${section}`);
                  },
                })
              }
            >
              {conversation.channel ? 'Leave channel' : 'Leave group'}
            </Button>
          </>
        }
      >
        <p>
          {myRole === 'owner'
            ? 'You are the owner. Ownership passes to another member when you leave.'
            : 'You will stop receiving messages from this group.'}
        </p>
        {leave.isError ? <Alert>{leave.error.message}</Alert> : null}
      </Dialog>
    </>
  );
}
