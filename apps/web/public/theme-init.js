// Runs before first paint so there is no theme flash. Kept as a file (not inline) so the CSP can forbid inline scripts.
try {
  var t = localStorage.getItem('gravity.theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
