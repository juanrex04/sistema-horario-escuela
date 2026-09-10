import type { ReactNode } from "react";

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-600">{children}</label>;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; wrapper?: string };
export function TextField({ label, wrapper = "flex-1", ...props }: TextFieldProps) {
  return (
    <div className={wrapper}>
      {label ? <Label>{label}</Label> : null}
      <input {...props} className={inputCls} />
    </div>
  );
}

type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  emptyLabel?: string;
  wrapper?: string;
};
export function SelectField({ label, children, emptyLabel = "Selecciona...", wrapper = "flex-1", ...props }: SelectFieldProps) {
  return (
    <div className={wrapper}>
      {label ? <Label>{label}</Label> : null}
      <select {...props} className={inputCls}>
        <option value="">{emptyLabel}</option>
        {children}
      </select>
    </div>
  );
}