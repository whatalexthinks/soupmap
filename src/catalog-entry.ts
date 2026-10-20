// Keep the static directory readable if the dataset or JavaScript is unavailable.
void import('./catalog/controller.ts').then(({ mountDirectory }) => mountDirectory()).catch(() => {
  const status = document.querySelector('[data-directory-status]');
  if (status) status.textContent = 'Interactive search could not load. You can still browse the pages below. Reload to retry.';
});
