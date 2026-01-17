/**
 * OpenSkills client-side functionality
 */

// Copy to clipboard
document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copyText;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      
      // Show success state
      const label = btn.querySelector('.copy-label');
      const success = btn.querySelector('.copy-success');
      
      if (label && success) {
        label.classList.add('hidden');
        success.classList.remove('hidden');
        
        // Reset after 2 seconds
        setTimeout(() => {
          label.classList.remove('hidden');
          success.classList.add('hidden');
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  });
});
