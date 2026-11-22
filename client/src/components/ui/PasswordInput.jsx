import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from './IconButton.jsx';
import { Input } from './Input.jsx';

/** Input with a show/hide toggle. Accepts every Input prop. */
export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <IconButton
          label={visible ? 'Hide password' : 'Show password'}
          icon={visible ? EyeOff : Eye}
          size="sm"
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        />
      }
    />
  );
}
