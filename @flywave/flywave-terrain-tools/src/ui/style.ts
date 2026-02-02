/* Copyright (C) 2025 flywave.gl contributors */

export const STYLES = `
.terrain-tools-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 320px;
  background: rgba(30, 30, 35, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  z-index: 1000;
}

.terrain-tools-panel .panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.terrain-tools-panel .panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.terrain-tools-panel .operation-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.terrain-tools-panel .panel-section {
  margin-bottom: 16px;
}

.terrain-tools-panel label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.terrain-tools-panel .brush-types {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.terrain-tools-panel .brush-btn {
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.terrain-tools-panel .brush-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.terrain-tools-panel .brush-btn.active {
  background: rgba(64, 169, 255, 0.3);
  border-color: rgba(64, 169, 255, 0.6);
  color: #40a9ff;
}

.terrain-tools-panel input[type="range"] {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;
}

.terrain-tools-panel input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #40a9ff;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.terrain-tools-panel input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.terrain-tools-panel input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #40a9ff;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.terrain-tools-panel .action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.terrain-tools-panel .action-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.terrain-tools-panel .action-btn.primary {
  background: #40a9ff;
  color: #ffffff;
}

.terrain-tools-panel .action-btn.primary:hover {
  background: #1890ff;
}

.terrain-tools-panel .action-btn.secondary {
  background: rgba(255, 77, 79, 0.2);
  border: 1px solid rgba(255, 77, 79, 0.4);
  color: #ff4d4f;
}

.terrain-tools-panel .action-btn.secondary:hover {
  background: rgba(255, 77, 79, 0.3);
  border-color: rgba(255, 77, 79, 0.6);
}

.terrain-tools-panel .dynamic-param {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .terrain-tools-panel {
    top: auto;
    bottom: 20px;
    right: 20px;
    left: 20px;
    width: auto;
  }
}
`;
