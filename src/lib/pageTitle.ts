const PRODUCT_NAME = "Next Session";

export function pageTitle(page?: string): string {
  return page ? `${page} · ${PRODUCT_NAME}` : PRODUCT_NAME;
}
