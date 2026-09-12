import { Select as AntdSelect } from 'antd';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
}

// Thin antd-backed shim so existing call sites keep working.
const Select = ({ value, onChange, options, placeholder, id }: SelectProps) => (
  <AntdSelect
    id={id}
    value={value || undefined}
    onChange={onChange}
    options={options}
    placeholder={placeholder}
    style={{ width: '100%' }}
    getPopupContainer={(node) => node.parentElement ?? document.body}
  />
);

export default Select;
