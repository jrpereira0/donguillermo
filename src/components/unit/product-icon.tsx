import { createElement } from "react";
import { productIcon } from "./product-categories";

/** Ícone da categoria do produto. */
export function ProductIcon({ category, className }: { category: string; className?: string }) {
  return createElement(productIcon(category), { className, "aria-hidden": true });
}
