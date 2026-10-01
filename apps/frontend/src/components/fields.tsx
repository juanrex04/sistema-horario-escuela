import { useId, type ReactNode } from "react";

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-tinta-suave">
      {children}
    </label>
  );
}

const inputCls =
  "w-full border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-tinta transition-colors placeholder:text-tenue focus:border-pizarra disabled:cursor-not-allowed disabled:bg-papel disabled:text-apagado";

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  wrapper?: string;
};
export function TextField({ label, wrapper = "flex-1", id, ...props }: TextFieldProps) {
  const generado = useId();
  const inputId = id ?? generado;
  return (
    <div className={wrapper}>
      {label ? <Label htmlFor={inputId}>{label}</Label> : null}
      <input id={inputId} {...props} className={inputCls} />
    </div>
  );
}

type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  emptyLabel?: string;
  wrapper?: string;
};
export function SelectField({
  label,
  children,
  emptyLabel = "Selecciona...",
  wrapper = "flex-1",
  id,
  ...props
}: SelectFieldProps) {
  const generado = useId();
  const selectId = id ?? generado;
  return (
    <div className={wrapper}>
      {label ? <Label htmlFor={selectId}>{label}</Label> : null}
      <select id={selectId} {...props} className={inputCls}>
        <option value="">{emptyLabel}</option>
        {children}
      </select>
    </div>
  );
}
