// Main Application Entry Point
import { LatheGame } from './game.js';

function bootGame() {
  const game = new LatheGame();
  game.init();
  window.latheGame = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootGame);
} else {
  // If script executes after DOM is already interactive/complete (common in standalone files & mobile browsers)
  bootGame();
}
