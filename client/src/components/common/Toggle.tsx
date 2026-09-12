import { Segmented } from 'antd';

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ToggleOption<T>[];
}

// Thin antd-backed shim (was a hand-rolled tab strip).
const Toggle = <T extends string>({ value, onChange, options }: ToggleProps<T>) => (
  <Segmented
    value={value}
    onChange={(v) => onChange(v as T)}
    options={options.map((o) => ({ label: o.label, value: o.value }))}
  />
);

export default Toggle;
