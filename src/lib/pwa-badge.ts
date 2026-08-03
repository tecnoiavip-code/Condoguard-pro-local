// Update the app badge on the device icon (PWA Badge API)
export const setAppBadge = (count: number) => {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  } catch {
    // Badge API not supported
  }
};
