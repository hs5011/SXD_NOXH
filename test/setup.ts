import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Components remember view state per tab (e.g. the project list's search); keep tests independent
afterEach(() => {
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
});
