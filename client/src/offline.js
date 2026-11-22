// Inline handlers are blocked by the Content Security Policy, so the retry button is wired here.
document.getElementById('retry')?.addEventListener('click', () => window.location.reload());
