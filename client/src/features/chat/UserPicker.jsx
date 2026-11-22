import { useState } from 'react';
import { Search } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useUserSearch } from './useConversations.js';
import styles from './UserPicker.module.css';

/**
 * Search the user directory and pick people. Users listed in excludeIds (already selected or
 * already members) are hidden so the same person cannot be added twice.
 */
export function UserPicker({
  onSelect,
  excludeIds = [],
  label = 'Search people',
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const search = useUserSearch(debounced);
  const tooShort = query.trim().length < 2;
  const results = (search.data ?? []).filter((user) => !excludeIds.includes(user.id));

  return (
    <div className={styles.picker}>
      <Input
        label={label}
        leadingIcon={Search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Name or username"
        autoComplete="off"
        spellCheck={false}
      />
      <div className={styles.results} aria-live="polite" aria-busy={search.isFetching}>
        {tooShort ? (
          <p className={styles.note}>Type at least 2 characters to search.</p>
        ) : search.isError ? (
          <Alert>{search.error.message}</Alert>
        ) : search.isPending || debounced !== query ? (
          <p className={styles.note}>Searching...</p>
        ) : results.length === 0 ? (
          <p className={styles.note}>No people found.</p>
        ) : (
          <ul className={styles.list}>
            {results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className={styles.option}
                  disabled={disabled}
                  onClick={() => onSelect(user)}
                >
                  <Avatar name={user.displayName} src={user.avatarUrl} size="sm" decorative />
                  <span className={styles.text}>
                    <span className={styles.name}>{user.displayName}</span>
                    <span className={styles.handle}>@{user.username}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
