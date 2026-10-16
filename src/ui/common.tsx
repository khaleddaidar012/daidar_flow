import React, { useState } from "react";
export type T = (ar: string, en: string) => string;
export type Action = (command: any, payload?: any) => Promise<any>;
export type Props = { data: any; action: Action; busy: boolean; t: T };
export const money = (n: number = 0) => (n / 100).toFixed(2);
export const quantity = (n: number = 0) => String(n / 1000);
type Field = [string, string, string, any?, boolean?];
export function Form({
  fields,
  onSubmit,
  submit,
  busy,
}: {
  fields: Field[];
  onSubmit: (v: any) => Promise<any>;
  submit: string;
  busy: boolean;
}) {
  const [local, setLocal] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setLocal("");
        try {
          await onSubmit(Object.fromEntries(new FormData(form).entries()));
          form.reset();
        } catch (e) {
          setLocal(e instanceof Error ? e.message : String(e));
        }
      }}
    >
      <div className="form-grid">
        {fields.map(([name, label, type, initial, required = true]) => (
          <label key={name}>
            {label}
            {type === "select" ? (
              <select
                name={name}
                required={required}
                defaultValue={initial?.[0]?.[0] || ""}
              >
                {initial?.length ? (
                  initial.map(([value, text]: string[]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))
                ) : (
                  <option value="">—</option>
                )}
              </select>
            ) : (
              <input
                name={name}
                type={type}
                required={required}
                defaultValue={initial ?? ""}
                step={type === "number" ? "0.001" : undefined}
                min={type === "number" ? "0" : undefined}
                autoComplete={type === "password" ? "new-password" : "off"}
              />
            )}
          </label>
        ))}
      </div>
      {local && (
        <p role="alert" className="error">
          {local}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {submit}
      </button>
    </form>
  );
}
export function Table({ columns, rows }: { columns: string[]; rows: any[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>—</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function Card({ title, value }: { title: string; value: any }) {
  return (
    <section className="card">
      <small>{title}</small>
      <strong>{value}</strong>
    </section>
  );
}
