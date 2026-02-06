import { createGlobalStyle } from "styled-components";
import "leaflet/dist/leaflet.css";
import "@jonatanheyman/leaflet-areaselect/src/leaflet-areaselect.css";

export const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
      monospace;
  }

  .leaflet-container {
    font-family: inherit;
  }

  .leaflet-drawing-overlay {
    background: transparent;
  }

  .ant-card {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
  }

  .ant-card-head {
    padding: 8px 16px !important;
    min-height: 40px;
  }

  .ant-card-head-title {
    padding: 0 !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  .ant-card-body {
    padding: 12px 16px !important;
  }
`;
