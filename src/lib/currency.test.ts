import { expect, test } from "vitest";
import { COUNTRIES } from "./profile";
import { currencyOf, money } from "./currency";

test("every profile country has a currency; guests and unknowns get rupees", () => {
  expect(currencyOf("IN")).toBe("INR");
  expect(currencyOf("US")).toBe("USD");
  expect(currencyOf("GB")).toBe("GBP");
  expect(currencyOf("NL")).toBe("EUR");
  expect(currencyOf(null)).toBe("INR");
  for (const c of COUNTRIES) expect(() => money(1, currencyOf(c)), c).not.toThrow();
});

test("prize amounts read unambiguously", () => {
  expect(money(100, "INR")).toBe("₹100");
  expect(money(1.04, "USD")).toBe("$1.04");
  expect(money(1.49, "AUD")).toBe("A$1.49");
  expect(money(287.47, "PKR").replace(/\s/g, " ")).toBe("PKR 287"); // Intl uses a no-break space
});
