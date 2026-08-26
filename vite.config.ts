import { defineConfig } from 'vite';

export default defineConfig({
  /**
   * Relative asset paths, not a hardcoded deploy path.
   *
   * The same build then works served from a domain root, served from a
   * subpath, and opened straight off disk by double-clicking dist/index.html.
   * A hardcoded base would tie the build to one URL and break the other two --
   * and the offline case is genuinely useful, since the game is a single 36KB
   * folder with no backend behind it.
   */
  base: './',
});
