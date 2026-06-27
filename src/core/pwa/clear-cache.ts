export async function clearAppCache(): Promise<void> {
  if ('caches' in window) {
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  }
  if ('serviceWorker' in navigator) {
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map((reg) => reg.unregister()));
  }
}
