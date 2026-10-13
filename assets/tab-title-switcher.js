/**
 * Alternates the browser-tab title while the document is hidden.
 * Configuration is supplied by the global script render in scripts.liquid.
 */
const tabTitleScript = document.currentScript;
const tabTitleMessage = tabTitleScript?.dataset.message?.trim();
const configuredInterval = Number(tabTitleScript?.dataset.interval);
const tabTitleInterval = Number.isFinite(configuredInterval) ? Math.max(configuredInterval, 1000) : 3000;

if (tabTitleMessage) {
  let pageTitle = document.title;
  let intervalId;
  let messageIsVisible = false;

  const restorePageTitle = () => {
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
      intervalId = undefined;
    }

    messageIsVisible = false;
    document.title = pageTitle;
  };

  const startTitleSwitching = () => {
    restorePageTitle();
    pageTitle = document.title;
    messageIsVisible = true;
    document.title = tabTitleMessage;

    intervalId = window.setInterval(() => {
      messageIsVisible = !messageIsVisible;
      document.title = messageIsVisible ? tabTitleMessage : pageTitle;
    }, tabTitleInterval);
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      startTitleSwitching();
      return;
    }

    restorePageTitle();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', restorePageTitle);
  handleVisibilityChange();
}
