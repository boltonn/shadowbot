"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BoundaryContact } from "@/features/routing/types";

const BOUNDARY_CONTACTS: { value: BoundaryContact; label: string }[] = [
  { value: "crosses", label: "Crosses through" },
  { value: "touches", label: "Touches (e.g. dead-ends at the edge)" },
  { value: "any", label: "Either" },
];

export function BoundaryContactSelect({
  value,
  onChange,
}: {
  value: BoundaryContact;
  onChange: (next: BoundaryContact) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next as BoundaryContact)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BOUNDARY_CONTACTS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
