export const ASSISTANT_VISIBILITY_METADATA_KEY = 'show_floating_assistant';
export const ASSISTANT_VISIBILITY_EVENT = 'app-assistant-visibility-changed';

export const isFloatingAssistantVisible = (user) =>
  user?.user_metadata?.[ASSISTANT_VISIBILITY_METADATA_KEY] !== false;

export const notifyAssistantVisibilityChanged = (userId, visible) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ASSISTANT_VISIBILITY_EVENT, {
    detail: { userId, visible },
  }));
};
