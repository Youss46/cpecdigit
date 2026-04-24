import * as React from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

function formatMontantDisplay(raw: string): string {
  if (!raw && raw !== "0") return "";
  const hasDecimal = raw.includes(".");
  const [intStr, decStr] = raw.split(".");
  const intDigits = intStr.replace(/\D/g, "");
  const formattedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  if (hasDecimal) {
    const decDigits = (decStr ?? "").replace(/\D/g, "");
    return `${formattedInt},${decDigits}`;
  }
  return formattedInt;
}

function stripMontantFormat(displayed: string): string {
  const noSpaces = displayed.replace(/[\u00A0\u0020]/g, "");
  const normalized = noSpaces.replace(",", ".");
  const cleaned = normalized.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) return parts[0] + "." + parts.slice(1).join("");
  return cleaned;
}

interface InputMontantProps {
  value: string;
  onChange: (rawValue: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
}

export function InputMontant({
  value,
  onChange,
  placeholder = "0",
  className,
  disabled,
  required,
  id,
  name,
}: InputMontantProps) {
  const displayValue = formatMontantDisplay(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(stripMontantFormat(e.target.value));
  };

  return (
    <InputGroup className={cn(className)} data-disabled={disabled ? "true" : undefined}>
      <InputGroupInput
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        id={id}
        name={name}
      />
      <InputGroupAddon align="inline-end">
        FCFA
      </InputGroupAddon>
    </InputGroup>
  );
}
