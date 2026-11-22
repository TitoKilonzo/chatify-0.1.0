import { useState } from 'react';

/** Controlled form values keyed by input name. Returns [values, handleChange, setValues]. */
export function useFormValues(initialValues) {
  const [values, setValues] = useState(initialValues);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  return [values, handleChange, setValues];
}
