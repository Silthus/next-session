const IME_PROCESSING_KEY_CODE = 229;

export function isImeComposing(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === IME_PROCESSING_KEY_CODE;
}
