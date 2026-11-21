import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

/** A select over a short list of labelled values. */
export function Picker<T extends string>({
  value,
  onChange,
  items,
  placeholder,
  testId,
  id,
  className = "w-full",
}: {
  value: T | null;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
  placeholder?: string;
  testId?: string;
  id?: string;
  className?: string;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next as T);
      }}
    >
      <SelectTrigger id={id} className={className} data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
