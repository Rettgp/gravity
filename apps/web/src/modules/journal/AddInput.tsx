import { useState } from 'react';
import { Icon } from '../../components/Icon';

export function AddInput({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  const submit = () => {
    if (v.trim()) onAdd(v);
    setV('');
  };
  return (
    <div className="jr-add">
      <input
        className="input"
        value={v}
        placeholder={placeholder}
        aria-label={label}
        maxLength={80}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button className="btn btn-ghost btn-sm" onClick={submit} aria-label={label + ' confirm'}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
