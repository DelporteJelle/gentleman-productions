// lib/text.ts

export function splitTitleAccent(title: string): { main: string; accent: string } {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return { main: title, accent: "" };
  return {
    main: words.slice(0, -1).join(" "),
    accent: words[words.length - 1],
  };
}

const ROMAN_PAIRS: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRomanNumerals(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n);
  let remaining = n;
  let result = "";
  for (const [value, symbol] of ROMAN_PAIRS) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
}
